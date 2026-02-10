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
    if (!isSA) throw new Error("Only superadmins can create users");

    const { email, password, full_name, consultant_id, group_id, role } = await req.json();
    if (!email || !password) throw new Error("Email and password required");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (authError) throw authError;

    const userId = authData.user.id;

    // Update profile with consultant_id if provided
    if (consultant_id) {
      await adminClient.from("profiles").update({ consultant_id, full_name: full_name || email }).eq("user_id", userId);
    }

    // Assign role if group provided
    if (group_id && role) {
      await adminClient.from("user_roles").insert({ user_id: userId, group_id, role });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
