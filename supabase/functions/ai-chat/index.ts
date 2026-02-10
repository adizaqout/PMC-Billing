import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT_BASE = `You are the PMC Billing & Deployment Control AI Assistant. You exist ONLY to help users with PMC system data.

## ABSOLUTE RULE — DO NOT BREAK THIS
You are FORBIDDEN from answering ANY question that is not directly related to the PMC Billing & Deployment Control system. This includes but is not limited to: general knowledge, coding, math, history, science, weather, recipes, jokes, translations, writing help, or any other topic.

If the user asks ANYTHING outside scope, respond ONLY with:
"I can only help with PMC deployment, billing, and project data. Please ask me about your consultants, deployment schedules, purchase orders, invoices, employees, or projects."

Then call suggest_followups with relevant PMC questions.

## YOUR SCOPE (the ONLY topics you may discuss):
- Consultants and their employees
- Deployment submissions and deployment lines (baseline, actual, forecast, workload)
- Purchase orders and purchase order items
- Service orders and framework agreements
- Invoices and billing
- Projects, portfolios, and financial data (budgets, actuals)
- Period control and approval workflows
- Positions and rates

## CRITICAL DATA RULE
You MUST ONLY use the real data provided below in the "LIVE DATABASE SNAPSHOT" section. NEVER invent, fabricate, or hallucinate any data. If the snapshot does not contain enough information to answer a question, say "I don't have enough data to answer that. The database snapshot may not cover this specific query."

## RESPONSE FORMAT
1. Provide clear, data-driven answers in text using ONLY the real data provided. Use markdown tables when presenting tabular data.
2. Do NOT generate charts unless the user explicitly asks for a chart, graph, or visualization.
3. Always call suggest_followups with 2-4 relevant follow-up questions. One can suggest a chart if relevant.

Only use generate_chart when explicitly requested. Use the REAL data from the snapshot. Chart types: bar, line, pie, area.`;

async function fetchDatabaseSnapshot(supabaseClient: any) {
  const sections: string[] = [];

  // Consultants with employee counts
  const { data: consultants } = await supabaseClient
    .from("consultants")
    .select("id, name, status, contact_email, contact_phone");
  
  if (consultants) {
    // Get employee counts per consultant
    const consultantSummaries = [];
    for (const c of consultants) {
      const { count } = await supabaseClient
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("consultant_id", c.id);
      
      const { count: activeCount } = await supabaseClient
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("consultant_id", c.id)
        .eq("status", "Active");

      consultantSummaries.push({
        name: c.name,
        status: c.status,
        total_employees: count || 0,
        active_employees: activeCount || 0,
      });
    }
    sections.push(`### Consultants\n${JSON.stringify(consultantSummaries, null, 2)}`);
  }

  // Projects summary
  const { data: projects } = await supabaseClient
    .from("projects")
    .select("project_name, project_number, status, portfolio, latest_budget, latest_pmc_budget, actual_pmc_to_date")
    .limit(50);
  if (projects && projects.length > 0) {
    sections.push(`### Projects (${projects.length} shown)\n${JSON.stringify(projects, null, 2)}`);
  }

  // Purchase orders summary
  const { data: pos } = await supabaseClient
    .from("purchase_orders")
    .select("po_number, status, po_value, amount, type, consultants(name)")
    .limit(50);
  if (pos && pos.length > 0) {
    sections.push(`### Purchase Orders (${pos.length} shown)\n${JSON.stringify(pos, null, 2)}`);
  }

  // Invoices summary
  const { data: invoices } = await supabaseClient
    .from("invoices")
    .select("invoice_number, invoice_month, status, billed_amount_no_vat, paid_amount, consultants(name)")
    .limit(50);
  if (invoices && invoices.length > 0) {
    sections.push(`### Invoices (${invoices.length} shown)\n${JSON.stringify(invoices, null, 2)}`);
  }

  // Deployment submissions summary
  const { data: submissions } = await supabaseClient
    .from("deployment_submissions")
    .select("month, schedule_type, status, revision_no, consultants(name)")
    .limit(50);
  if (submissions && submissions.length > 0) {
    sections.push(`### Deployment Submissions (${submissions.length} shown)\n${JSON.stringify(submissions, null, 2)}`);
  }

  // Service orders
  const { data: sos } = await supabaseClient
    .from("service_orders")
    .select("so_number, so_value, so_start_date, so_end_date, consultants(name)")
    .limit(50);
  if (sos && sos.length > 0) {
    sections.push(`### Service Orders (${sos.length} shown)\n${JSON.stringify(sos, null, 2)}`);
  }

  // Framework agreements
  const { data: fas } = await supabaseClient
    .from("framework_agreements")
    .select("framework_agreement_no, status, start_date, end_date, consultants(name)")
    .limit(50);
  if (fas && fas.length > 0) {
    sections.push(`### Framework Agreements (${fas.length} shown)\n${JSON.stringify(fas, null, 2)}`);
  }

  // Period control
  const { data: periods } = await supabaseClient
    .from("period_control")
    .select("month, status")
    .order("month", { ascending: false })
    .limit(12);
  if (periods && periods.length > 0) {
    sections.push(`### Period Control (recent 12)\n${JSON.stringify(periods, null, 2)}`);
  }

  // Positions summary
  const { data: positions } = await supabaseClient
    .from("positions")
    .select("position_id, position_name, year_1_rate, year_2_rate, consultants(name)")
    .limit(50);
  if (positions && positions.length > 0) {
    sections.push(`### Positions (${positions.length} shown)\n${JSON.stringify(positions, null, 2)}`);
  }

  return sections.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Create Supabase client with service role to read data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch real data
    const snapshot = await fetchDatabaseSnapshot(supabaseClient);
    
    const systemPrompt = `${SYSTEM_PROMPT_BASE}

## LIVE DATABASE SNAPSHOT
The following is REAL data from the system. Use ONLY this data in your answers.

${snapshot}`;

    const tools = [
      {
        type: "function",
        function: {
          name: "generate_chart",
          description:
            "Generate a chart/graph visualization. Use when users ask for visual data representation.",
          parameters: {
            type: "object",
            properties: {
              chart_type: {
                type: "string",
                enum: ["bar", "line", "pie", "area"],
                description: "Type of chart to generate",
              },
              title: {
                type: "string",
                description: "Chart title",
              },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    value: { type: "number" },
                    value2: { type: "number" },
                    value3: { type: "number" },
                  },
                  required: ["name", "value"],
                },
                description: "Array of data points for the chart",
              },
              x_label: { type: "string", description: "X-axis label" },
              y_label: { type: "string", description: "Y-axis label" },
              series_names: {
                type: "array",
                items: { type: "string" },
                description:
                  "Names for each data series (value, value2, value3)",
              },
            },
            required: ["chart_type", "title", "data"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "suggest_followups",
          description:
            "Suggest follow-up questions the user might want to ask. Call this after every response.",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: { type: "string" },
                description: "2-4 follow-up questions",
              },
            },
            required: ["questions"],
          },
        },
      },
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          tools,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Process tool calls
    let textContent = message?.content || "";
    let chartData = null;
    let followups: string[] = [];

    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        const args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;

        if (tc.function.name === "generate_chart") {
          chartData = args;
        } else if (tc.function.name === "suggest_followups") {
          followups = args.questions || [];
        }
      }
    }

    return new Response(
      JSON.stringify({
        content: textContent,
        chart: chartData,
        followups,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
