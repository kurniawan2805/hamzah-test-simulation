import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client scoped to user's JWT to verify admin status
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Access denied: Admin authorization required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const packageIds: string[] = Array.isArray(body.packageIds) ? body.packageIds : [];

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");
    let invitationData: unknown = null;
    let clerkError: string | null = null;

    if (clerkSecretKey) {
      const clerkRes = await fetch("https://api.clerk.com/v1/invitations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_address: email }),
      });

      const resJson = await clerkRes.json();
      if (clerkRes.ok) {
        invitationData = resJson;
      } else {
        // Handle cases where email might already be registered/invited
        clerkError = resJson.errors?.[0]?.long_message || resJson.errors?.[0]?.message || "Clerk API invitation warning";
        invitationData = resJson;
      }
    } else {
      invitationData = { simulated: true, email };
    }

    // Assign packages if packageIds provided
    if (packageIds.length > 0) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { error: assignErr } = await adminClient.rpc("admin_assign_packages", {
        p_user_id: email,
        p_package_ids: packageIds,
      });

      if (assignErr) {
        throw new Error(`Package assignment failed: ${assignErr.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: clerkError
          ? `Undangan diproses (${clerkError}), penugasan paket berhasil.`
          : "Undangan email Clerk berhasil dikirim dan paket ditugaskan.",
        email,
        invitation: invitationData,
        assignedPackages: packageIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
