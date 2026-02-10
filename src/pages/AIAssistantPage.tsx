import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, User, BarChart3, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface ChartData {
  chart_type: "bar" | "line" | "pie" | "area";
  title: string;
  data: { name: string; value: number; value2?: number; value3?: number }[];
  x_label?: string;
  y_label?: string;
  series_names?: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  chart?: ChartData | null;
  followups?: string[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(330, 65%, 50%)",
];

const WELCOME_FOLLOWUPS = [
  "Show me a summary of all active consultants and their employee counts",
  "What is the current billing status across all purchase orders?",
  "Generate a chart of project allocations by consultant",
  "How many deployment submissions are pending approval?",
];

function InlineChart({ chart }: { chart: ChartData }) {
  const seriesNames = chart.series_names || ["Value"];
  const hasMultiple = chart.data.some((d) => d.value2 !== undefined);

  return (
    <div className="my-4 p-4 bg-muted/30 rounded-lg border">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <BarChart3 size={14} className="text-primary" />
        {chart.title}
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        {chart.chart_type === "bar" ? (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" name={seriesNames[0]} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            {hasMultiple && <Bar dataKey="value2" name={seriesNames[1] || "Value 2"} fill={COLORS[1]} radius={[4, 4, 0, 0]} />}
          </BarChart>
        ) : chart.chart_type === "line" ? (
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" name={seriesNames[0]} stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            {hasMultiple && <Line type="monotone" dataKey="value2" name={seriesNames[1] || "Value 2"} stroke={COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />}
          </LineChart>
        ) : chart.chart_type === "area" ? (
          <AreaChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="value" name={seriesNames[0]} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} />
            {hasMultiple && <Area type="monotone" dataKey="value2" name={seriesNames[1] || "Value 2"} stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.2} />}
          </AreaChart>
        ) : (
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {chart.data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { messages: apiMessages },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content || "I've generated the visualization above.",
        chart: data.chart || null,
        followups: data.followups || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      console.error("AI chat error:", e);
      toast.error("Failed to get AI response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const lastFollowups = messages.length > 0
    ? messages[messages.length - 1].followups || []
    : WELCOME_FOLLOWUPS;

  return (
    <AppLayout>
      <div className="animate-fade-in flex flex-col h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pb-3 shrink-0">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Bot size={22} className="text-primary" />
              AI Assistant
            </h1>
            <p className="page-subtitle">Ask questions about your deployment, billing, and project data</p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat}>
              <Trash2 size={14} className="mr-1.5" />Clear Chat
            </Button>
          )}
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-lg border bg-card mb-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">How can I help you today?</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                I can analyze your deployment data, generate charts, track billing status, and answer questions about your PMC operations.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                {WELCOME_FOLLOWUPS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-2 rounded-lg border bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-left max-w-[280px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} className="text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[75%] ${msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
                    : "bg-muted/50 rounded-2xl rounded-bl-md px-4 py-2.5"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.chart && <InlineChart chart={msg.chart} />}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <User size={14} className="text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot size={14} className="text-primary" />
                  </div>
                  <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Follow-up suggestions */}
        {lastFollowups.length > 0 && messages.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 mb-3 px-1">
            {lastFollowups.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 flex gap-2 items-end px-1 pb-1">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about deployments, billing, projects..."
            className="resize-none min-h-[44px] max-h-[120px] text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
