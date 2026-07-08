"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Issue } from "@/lib/types";
import { Badge, Button, buttonClass, Field, inputClass, Window } from "@/components/ui";

const TYPES: { value: Issue["type"]; label: string }[] = [
  { value: "equipment", label: "Equipment fault" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Something else" },
];

const SEVERITIES: Issue["severity"][] = ["low", "medium", "high", "urgent"];

export function ReportForm({
  machines,
  initialMachine,
}: {
  machines: { slug: string; name: string }[];
  initialMachine: string;
}) {
  const [machine, setMachine] = useState(initialMachine);
  const [type, setType] = useState<Issue["type"]>("equipment");
  const [severity, setSeverity] = useState<Issue["severity"]>("medium");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createIssue({
        machine_slug: machine || null,
        type,
        severity,
        description: description.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "report failed");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Window title="ISSUE.RPT" floating bodyClassName="flex flex-col gap-4 p-6 md:p-8">
          <Badge variant="success" mono>
            filed
          </Badge>
          <h1 className="text-[26px] md:text-[32px]">Report filed</h1>
          <p className="text-[15px] leading-[1.65] text-body">
            Lab staff triage reports from the admin dashboard
            {severity === "urgent" && " and get notified immediately for urgent ones"}
            . Thanks for flagging it.
          </p>
          <div className="flex gap-3">
            <Link href="/machines" className={buttonClass("primary")}>
              Back to machines
            </Link>
          </div>
        </Window>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <Window title="ISSUE.RPT" floating bodyClassName="flex flex-col gap-4 p-6 md:p-8">
        <div>
          <h1 className="text-[26px] md:text-[32px]">Report an issue</h1>
          <p className="mt-1 text-[13px] text-body-subtle">
            Broken machine, missing guard, weird smell — tell the staff.
          </p>
        </div>
        <Field id="issue-machine" label="Machine (optional)">
          <select
            id="issue-machine"
            className={inputClass}
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
          >
            <option value="">Not machine-specific</option>
            {machines.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="issue-type" label="Type">
            <select
              id="issue-type"
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as Issue["type"])}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="issue-severity" label="Severity">
            <select
              id="issue-severity"
              className={inputClass}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Issue["severity"])}
            >
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="issue-description" label="What happened?">
          <textarea
            id="issue-description"
            className={`${inputClass} min-h-[120px]`}
            value={description}
            maxLength={2000}
            placeholder="What's wrong, and where?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="font-mono text-[12px] text-fg-danger">
            {error}
          </p>
        )}
        <Button
          data-testid="submit-issue"
          disabled={!description.trim() || busy}
          onClick={() => void submit()}
        >
          File report
        </Button>
      </Window>
    </div>
  );
}
