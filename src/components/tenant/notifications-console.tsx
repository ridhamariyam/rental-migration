"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2Icon,
  ClockIcon,
  type LucideIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SettingsIcon,
  SmartphoneIcon,
  XCircleIcon,
} from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_VARIABLES,
  notificationStatusTone,
  type NotificationEvent,
} from "@/lib/notifications";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type WhatsappNumber = {
  id: string;
  integratedNumber: string;
  displayName: string | null;
  status: string;
  isDefault: boolean;
};

type WhatsappTemplate = {
  id: string;
  integratedNumber: string;
  name: string;
  namespace: string | null;
  language: string;
  category: string | null;
  status: string;
  body: string | null;
  variableSlots: string[];
};

type Rule = {
  id: string;
  event: NotificationEvent;
  whatsappNumberId: string | null;
  templateId: string | null;
  isEnabled: boolean;
  scheduleOffsetMinutes: number;
  repeatLimit: number;
  variableMapping: Record<string, string>;
  templateName: string | null;
  integratedNumber: string | null;
};

type Log = {
  id: string;
  event: NotificationEvent;
  recipientPhone: string;
  recipientName: string | null;
  templateName: string;
  status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "cancelled";
  attempts: number;
  scheduledFor: string | Date | null;
  sentAt: string | Date | null;
  bookingNumber: string | null;
  customerName: string | null;
};

type Dashboard = {
  stats: { queued: number; sent: number; failed: number };
  numbers: WhatsappNumber[];
  templates: WhatsappTemplate[];
  rules: Rule[];
  logs: { items: Log[]; total: number; page: number; totalPages: number };
};

const STAT_TILES: { label: string; value: keyof Dashboard["stats"]; icon: LucideIcon }[] = [
  { label: "Queued", value: "queued", icon: ClockIcon },
  { label: "Sent", value: "sent", icon: SendIcon },
  { label: "Failed", value: "failed", icon: XCircleIcon },
];

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError || error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function sortedRules(rules: Rule[]) {
  return [...rules].sort(
    (a, b) => NOTIFICATION_EVENTS.indexOf(a.event) - NOTIFICATION_EVENTS.indexOf(b.event),
  );
}

export function NotificationsConsole({
  dashboard,
  canManage,
}: {
  dashboard: Dashboard;
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rules, setRules] = useState(() => sortedRules(dashboard.rules));
  const [integratedNumber, setIntegratedNumber] = useState("");
  const [logQuery, setLogQuery] = useState(searchParams.get("q") ?? "");
  const [logStatus, setLogStatus] = useState(searchParams.get("status") ?? "all");
  const [logEvent, setLogEvent] = useState(searchParams.get("event") ?? "all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultNumber = dashboard.numbers.find((number) => number.isDefault);
  const approvedTemplates = dashboard.templates.filter(
    (template) => template.status.toLowerCase() === "approved",
  );
  const templateById = useMemo(
    () => new Map(dashboard.templates.map((template) => [template.id, template])),
    [dashboard.templates],
  );

  function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  }

  function updateRule(event: NotificationEvent, patch: Partial<Rule>) {
    setRules((current) =>
      current.map((rule) =>
        rule.event === event ? { ...rule, ...patch } : rule,
      ),
    );
  }

  function updateRuleMapping(event: NotificationEvent, slot: string, variable: string) {
    setRules((current) =>
      current.map((rule) =>
        rule.event === event
          ? { ...rule, variableMapping: { ...rule.variableMapping, [slot]: variable } }
          : rule,
      ),
    );
  }

  function applyLogFilters() {
    const params = new URLSearchParams();
    if (logQuery.trim()) params.set("q", logQuery.trim());
    if (logStatus !== "all") params.set("status", logStatus);
    if (logEvent !== "all") params.set("event", logEvent);
    router.push(params.size ? `/dashboard/notifications?${params}` : "/dashboard/notifications");
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Connect tenant WhatsApp numbers through MSG91, sync approved
            templates, map variables, and track every automated send.
          </p>
        </div>
        <Badge variant={defaultNumber ? "default" : "secondary"}>
          <SmartphoneIcon />
          {defaultNumber ? defaultNumber.integratedNumber : "No number selected"}
        </Badge>
      </div>

      {(message || error) && (
        <div
          className={
            error
              ? "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              : "rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary"
          }
        >
          {error ?? message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STAT_TILES.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 px-4">
              <Icon className="text-muted-foreground size-5" />
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
                <p className="text-lg font-semibold">{dashboard.stats[value]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="size-4" />
            MSG91 setup
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3 text-sm">
            {[
              "Tenant Meta Business Portfolio is verified.",
              "WhatsApp number is added through MSG91 Add Number.",
              "Dedicated WhatsApp wallet has balance or auto-recharge.",
              "Templates are approved in MSG91 before mapping here.",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            <Label htmlFor="integrated-number">Integrated WhatsApp number</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="integrated-number"
                value={integratedNumber}
                onChange={(event) => setIntegratedNumber(event.target.value)}
                placeholder="919876543210"
                disabled={!canManage || pending}
              />
              <Button
                disabled={!canManage || pending}
                onClick={() =>
                  run(async () => {
                    await apiRequest("/api/notifications/numbers/sync", {
                      method: "POST",
                      body: JSON.stringify({ integratedNumber: integratedNumber || undefined }),
                    });
                    setMessage("WhatsApp numbers synced.");
                  })
                }
              >
                <RefreshCwIcon />
                Sync numbers
              </Button>
              <Button
                variant="outline"
                disabled={!canManage || pending || !defaultNumber}
                onClick={() =>
                  run(async () => {
                    await apiRequest("/api/notifications/templates/sync", {
                      method: "POST",
                      body: JSON.stringify({ whatsappNumberId: defaultNumber?.id }),
                    });
                    setMessage("Templates synced.");
                  })
                }
              >
                <RefreshCwIcon />
                Sync templates
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numbers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.numbers.map((number) => (
                <TableRow key={number.id}>
                  <TableCell className="font-medium">{number.integratedNumber}</TableCell>
                  <TableCell>{number.displayName ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{number.status}</Badge></TableCell>
                  <TableCell>
                    {number.isDefault ? (
                      <Badge>Default</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canManage || pending}
                        onClick={() =>
                          run(async () => {
                            await apiRequest(`/api/notifications/numbers/${number.id}/default`, {
                              method: "PATCH",
                            });
                            setMessage("Default number updated.");
                          })
                        }
                      >
                        Set
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {dashboard.numbers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                    No WhatsApp number has been connected yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Body</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="min-w-48 font-medium">
                    {template.name}
                  </TableCell>
                  <TableCell>{template.integratedNumber}</TableCell>
                  <TableCell>{template.language}</TableCell>
                  <TableCell>{template.category ?? "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        template.status.toLowerCase() === "approved"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {template.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-40">
                    {template.variableSlots.length > 0
                      ? template.variableSlots.join(", ")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
                    {template.body ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
              {dashboard.templates.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-24 text-center"
                  >
                    No approved templates have been synced yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Offset minutes</TableHead>
                  <TableHead>Variables</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const template = rule.templateId ? templateById.get(rule.templateId) : null;
                  const slots = template?.variableSlots?.length
                    ? template.variableSlots
                    : ["body_1", "body_2", "body_3", "body_4"];

                  return (
                    <TableRow key={rule.event}>
                      <TableCell className="min-w-44 font-medium">
                        {NOTIFICATION_EVENT_LABELS[rule.event]}
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={rule.isEnabled}
                          disabled={!canManage}
                          onCheckedChange={(checked) =>
                            updateRule(rule.event, { isEnabled: checked === true })
                          }
                        />
                      </TableCell>
                      <TableCell className="min-w-48">
                        <Select
                          value={rule.whatsappNumberId ?? "none"}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            updateRule(rule.event, {
                              whatsappNumberId: value === "none" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Choose number</SelectItem>
                            {dashboard.numbers.map((number) => (
                              <SelectItem key={number.id} value={number.id}>
                                {number.integratedNumber}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <Select
                          value={rule.templateId ?? "none"}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            updateRule(rule.event, {
                              templateId: value === "none" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Choose template</SelectItem>
                            {approvedTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name} ({template.language})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Input
                          type="number"
                          value={rule.scheduleOffsetMinutes}
                          disabled={!canManage}
                          onChange={(event) =>
                            updateRule(rule.event, {
                              scheduleOffsetMinutes: Number(event.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="min-w-72">
                        <div className="grid gap-2">
                          {slots.slice(0, 6).map((slot) => (
                            <div key={slot} className="grid grid-cols-[88px_1fr] items-center gap-2">
                              <span className="text-muted-foreground text-xs">{slot}</span>
                              <Select
                                value={rule.variableMapping[slot] ?? "none"}
                                disabled={!canManage}
                                onValueChange={(value) =>
                                  updateRuleMapping(
                                    rule.event,
                                    String(slot),
                                    value === "none" ? "" : String(value ?? ""),
                                  )
                                }
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Choose variable</SelectItem>
                                  {NOTIFICATION_VARIABLES.map((variable) => (
                                    <SelectItem key={variable} value={variable}>
                                      {variable}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Button
            disabled={!canManage || pending}
            onClick={() =>
              run(async () => {
                const cleaned = rules.map((rule) => ({
                  ...rule,
                  variableMapping: Object.fromEntries(
                    Object.entries(rule.variableMapping).filter(([, value]) => value),
                  ),
                }));
                const saved = await apiRequest<Rule[]>("/api/notifications/rules", {
                  method: "PUT",
                  body: JSON.stringify({ rules: cleaned }),
                });
                setRules(sortedRules(saved));
                setMessage("Notification rules saved.");
              })
            }
          >
            <SaveIcon />
            Save rules
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="Search customer, phone, booking, template"
              className="sm:max-w-sm"
            />
            <Select value={logStatus} onValueChange={(value) => setLogStatus(value ?? "all")}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "queued", "sending", "sent", "delivered", "read", "failed", "cancelled"].map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logEvent} onValueChange={(value) => setLogEvent(value ?? "all")}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all events</SelectItem>
                {NOTIFICATION_EVENTS.map((event) => (
                  <SelectItem key={event} value={event}>
                    {NOTIFICATION_EVENT_LABELS[event]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={applyLogFilters}>
              Apply
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Retry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.logs.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.sentAt
                      ? formatDateTime(log.sentAt)
                      : log.scheduledFor
                        ? formatDateTime(log.scheduledFor)
                        : "Queued"}
                  </TableCell>
                  <TableCell>{log.customerName ?? log.recipientName ?? log.recipientPhone}</TableCell>
                  <TableCell>{log.bookingNumber ?? "-"}</TableCell>
                  <TableCell>{NOTIFICATION_EVENT_LABELS[log.event]}</TableCell>
                  <TableCell>{log.templateName}</TableCell>
                  <TableCell>
                    <Badge variant={notificationStatusTone(log.status)}>{log.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!canManage || pending || log.status !== "failed"}
                      title="Retry notification"
                      onClick={() =>
                        run(async () => {
                          await apiRequest(`/api/notifications/${log.id}/retry`, {
                            method: "POST",
                          });
                          setMessage("Notification queued for retry.");
                        })
                      }
                    >
                      <RotateCcwIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {dashboard.logs.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    No notifications have been queued yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
