import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the PMC Billing & Deployment Control AI Assistant. You help users analyze deployment schedules, billing data, project allocations, and financial metrics.

You have deep knowledge of:
- Consultant deployment schedules (baseline, actual, forecast, workload)
- Purchase orders, service orders, and framework agreements
- Invoice tracking and billing analysis
- Employee allocations and man-month calculations
- Period control and approval workflows

When users ask analytical questions:
1. Provide clear, data-driven answers
2. When appropriate, suggest visualizations by using the generate_chart tool
3. Always provide follow-up questions to guide deeper analysis

IMPORTANT: After every response, you MUST call the suggest_followups tool to provide 2-4 relevant follow-up questions the user might want to ask next.

When the user asks for charts, graphs, or visualizations, use the generate_chart tool with appropriate data. Use realistic sample data if you don't have actual data. Chart types: bar, line, pie, area.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            { role: "system", content: SYSTEM_PROMPT },
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
