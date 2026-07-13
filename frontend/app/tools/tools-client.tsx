"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Checkout } from "@/lib/types";
import {
  Badge,
  Button,
  Field,
  inputClass,
  SysLabel,
  Window,
} from "@/components/ui";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function ToolsClient({
  categories,
  initialCheckouts,
}: {
  categories: string[];
  initialCheckouts: Checkout[];
}) {
  const [checkouts, setCheckouts] = useState(initialCheckouts);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [toolName, setToolName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const [dueDate, setDueDate] = useState(isoDate(weekAhead));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = checkouts.filter((c) => c.status === "out");
  const returned = checkouts.filter((c) => c.status === "returned");

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCheckout({
        category,
        tool_name: toolName.trim(),
        quantity,
        due_date: dueDate,
      });
      setCheckouts((current) => [created, ...current]);
      setToolName("");
      setQuantity(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout failed");
    } finally {
      setBusy(false);
    }
  };

  const giveBack = async (checkout: Checkout) => {
    setError(null);
    try {
      const updated = await api.returnCheckout(checkout.id);
      setCheckouts((current) =>
        current.map((c) => (c.id === checkout.id ? updated : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "return failed");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
      <Window
        title="TOOL_CHECKOUT.LOG"
        floating
        bodyClassName="flex flex-col gap-4 p-5 md:p-6"
      >
        <div>
          <h1 className="text-[26px] md:text-[32px]">Take a tool out</h1>
          <p className="mt-1 text-[13px] text-body-subtle">
            Log what leaves the lab and when it&apos;s coming back.
          </p>
        </div>
        <Field id="co-category" label="Category">
          <select
            id="co-category"
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field id="co-tool" label="Tool">
          <input
            id="co-tool"
            className={inputClass}
            value={toolName}
            maxLength={200}
            placeholder="e.g. Torque wrench"
            onChange={(e) => setToolName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="co-qty" label="Quantity">
            <input
              id="co-qty"
              type="number"
              min={1}
              max={100}
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <Field id="co-due" label="Return by">
            <input
              id="co-due"
              type="date"
              className={inputClass}
              value={dueDate}
              min={isoDate(new Date())}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="font-mono text-[12px] text-fg-danger">
            {error}
          </p>
        )}
        <Button
          data-testid="submit-checkout"
          disabled={!toolName.trim() || busy}
          onClick={() => void submit()}
        >
          Check out
        </Button>
      </Window>

      <Window title={`OUT.NOW (${open.length})`} bodyClassName="p-5 md:p-6">
        {open.length > 0 ? (
          <ul
            data-testid="open-checkouts"
            className="flex flex-col divide-y divide-border-default-subtle"
          >
            {open.map((checkout) => (
              <li
                key={checkout.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-heading">
                    {checkout.tool_name}
                    {checkout.quantity > 1 && ` ×${checkout.quantity}`}
                  </span>
                  <SysLabel>
                    {checkout.category} · due {checkout.due_date}
                  </SysLabel>
                </span>
                <Button
                  variant="tertiary"
                  onClick={() => void giveBack(checkout)}
                >
                  Return
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] leading-[1.65] text-body-subtle">
            Nothing checked out right now.
          </p>
        )}
      </Window>

      {returned.length > 0 && (
        <Window title="RETURNED.LOG" bodyClassName="p-5 md:p-6">
          <ul className="flex flex-col divide-y divide-border-default-subtle">
            {returned.map((checkout) => (
              <li
                key={checkout.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-body">
                    {checkout.tool_name}
                    {checkout.quantity > 1 && ` ×${checkout.quantity}`}
                  </span>
                  <SysLabel>{checkout.category}</SysLabel>
                </span>
                <Badge variant="gray" mono>
                  returned
                </Badge>
              </li>
            ))}
          </ul>
        </Window>
      )}
    </div>
  );
}
