import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin or superadmin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check roles
    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", user.id);
    const roleList = roles?.map((r: any) => r.role) || [];
    if (!roleList.includes("superadmin") && !roleList.includes("admin")) {
      return new Response(JSON.stringify({ error: "Only admin or superadmin can delete consultants" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { consultant_id } = await req.json();
    if (!consultant_id) {
      return new Response(JSON.stringify({ error: "consultant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for cascading deletes
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get submission IDs for this consultant
    const { data: submissions } = await adminClient
      .from("deployment_submissions")
      .select("id")
      .eq("consultant_id", consultant_id);
    const submissionIds = submissions?.map((s: any) => s.id) || [];

    // 2. Delete deployment_lines for those submissions
    if (submissionIds.length > 0) {
      await adminClient.from("deployment_lines").delete().in("submission_id", submissionIds);
    }

    // 3. Delete deployment_submissions
    await adminClient.from("deployment_submissions").delete().eq("consultant_id", consultant_id);

    // 4. Get PO IDs for this consultant
    const { data: pos } = await adminClient
      .from("purchase_orders")
      .select("id")
      .eq("consultant_id", consultant_id);
    const poIds = pos?.map((p: any) => p.id) || [];

    // 5. Delete invoices referencing those POs or this consultant
    await adminClient.from("invoices").delete().eq("consultant_id", consultant_id);

    // 6. Delete purchase_order_items for those POs
    if (poIds.length > 0) {
      await adminClient.from("purchase_order_items").delete().in("po_id", poIds);
    }

    // 7. Delete purchase_orders
    await adminClient.from("purchase_orders").delete().eq("consultant_id", consultant_id);

    // 8. Delete employees (references positions, but position_id is nullable)
    await adminClient.from("employees").delete().eq("consultant_id", consultant_id);

    // 9. Delete positions
    await adminClient.from("positions").delete().eq("consultant_id", consultant_id);

    // 10. Delete service_orders
    await adminClient.from("service_orders").delete().eq("consultant_id", consultant_id);

    // 11. Delete framework_agreements
    await adminClient.from("framework_agreements").delete().eq("consultant_id", consultant_id);

    // 12. Delete consultant_period_constraints
    await adminClient.from("consultant_period_constraints").delete().eq("consultant_id", consultant_id);

    // 13. Unlink profiles (set consultant_id to null, don't delete users)
    await adminClient.from("profiles").update({ consultant_id: null }).eq("consultant_id", consultant_id);

    // 14. Delete groups linked to this consultant
    const { data: groups } = await adminClient
      .from("groups")
      .select("id")
      .eq("consultant_id", consultant_id);
    const groupIds = groups?.map((g: any) => g.id) || [];

    if (groupIds.length > 0) {
      await adminClient.from("group_permissions").delete().in("group_id", groupIds);
      await adminClient.from("group_feature_toggles").delete().in("group_id", groupIds);
      await adminClient.from("group_dashboard_gadget_visibility").delete().in("group_id", groupIds);
      await adminClient.from("group_report_visibility").delete().in("group_id", groupIds);
      await adminClient.from("user_roles").delete().in("group_id", groupIds);
      await adminClient.from("groups").delete().eq("consultant_id", consultant_id);
    }

    // 15. Finally delete the consultant
    const { error: deleteError } = await adminClient
      .from("consultants")
      .delete()
      .eq("id", consultant_id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
