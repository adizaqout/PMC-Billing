import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is superadmin
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isSA } = await callerClient.rpc("is_superadmin");
    if (!isSA) throw new Error("Only superadmins can manage users");

    const { action, user_id, updates } = await req.json();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === "delete") {
      if (!user_id) throw new Error("user_id required");
      // Delete profile, roles, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!user_id) throw new Error("user_id required");
      // Update profile fields
      if (updates?.full_name !== undefined || updates?.consultant_id !== undefined || updates?.status !== undefined) {
        const profileUpdate: Record<string, any> = {};
        if (updates.full_name !== undefined) profileUpdate.full_name = updates.full_name;
        if (updates.consultant_id !== undefined) profileUpdate.consultant_id = updates.consultant_id || null;
        if (updates.status !== undefined) profileUpdate.status = updates.status;
        const { error } = await adminClient.from("profiles").update(profileUpdate).eq("user_id", user_id);
        if (error) throw error;
      }
      // Update email if changed
      if (updates?.email) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { email: updates.email });
        if (error) throw error;
        await adminClient.from("profiles").update({ email: updates.email }).eq("user_id", user_id);
      }
      // Reset password if provided
      if (updates?.password) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: updates.password });
        if (error) throw error;
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
