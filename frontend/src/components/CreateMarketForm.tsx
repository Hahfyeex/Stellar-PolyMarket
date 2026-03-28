"use client";

import { useState } from "react";
import { useWalletContext } from "../context/WalletContext";
import { invokeCreateMarketOnChain } from "../lib/createMarket";
import { validateStellarAddress } from "../lib/stellar";

type Category =
  | "Sports"
  | "Crypto"
  | "Finance"
  | "Politics"
  | "Weather"
  | "Entertainment";

interface CreateMarketFormProps {
  onCreated?: (marketId: number) => void;
}

interface FormValues {
  question: string;
  outcomes: string[];
  endDateTime: string;
  tokenAddress: string;
  category: Category;
}

interface FormErrors {
  question?: string;
  outcomes?: string[];
  endDateTime?: string;
  tokenAddress?: string;
  category?: string;
  form?: string;
}

const CATEGORY_OPTIONS: Category[] = [
  "Sports",
  "Crypto",
  "Finance",
  "Politics",
  "Weather",
  "Entertainment",
];

const EMPTY_FORM: FormValues = {
  question: "",
  outcomes: ["", ""],
  endDateTime: "",
  tokenAddress: "",
  category: "Sports",
};

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.question.trim().length < 10) {
    errors.question = "Question must be at least 10 characters.";
  } else if (values.question.trim().length > 500) {
    errors.question = "Question must be 500 characters or fewer.";
  }

  if (values.outcomes.length < 2 || values.outcomes.length > 8) {
    errors.outcomes = ["Add between 2 and 8 outcomes."];
  } else {
    const outcomeErrors = values.outcomes.map((outcome) =>
      outcome.trim() ? "" : "Outcome label is required."
    );
    if (outcomeErrors.some(Boolean)) {
      errors.outcomes = outcomeErrors;
    }
  }

  if (!values.endDateTime) {
    errors.endDateTime = "Select an end date and time.";
  } else if (new Date(values.endDateTime).getTime() < Date.now() + 60 * 60 * 1000) {
    errors.endDateTime = "End date must be at least 1 hour in the future.";
  }

  if (!validateStellarAddress(values.tokenAddress)) {
    errors.tokenAddress = "Enter a valid Stellar token address.";
  }

  if (!values.category) {
    errors.category = "Select a category.";
  }

  return errors;
}

export default function CreateMarketForm({ onCreated }: CreateMarketFormProps) {
  const { publicKey, connect, connecting } = useWalletContext();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "signing" | "success">("idle");

  const setField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleBlur = (field: string) => {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors(validateForm(values));
  };

  const setOutcome = (index: number, value: string) => {
    const next = [...values.outcomes];
    next[index] = value;
    setField("outcomes", next);
  };

  const addOutcome = () => {
    if (values.outcomes.length >= 8) return;
    setField("outcomes", [...values.outcomes, ""]);
  };

  const removeOutcome = (index: number) => {
    if (values.outcomes.length <= 2) return;
    setField(
      "outcomes",
      values.outcomes.filter((_, currentIndex) => currentIndex !== index)
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateForm(values);
    const nextTouched: Record<string, boolean> = {
      question: true,
      endDateTime: true,
      tokenAddress: true,
      category: true,
    };
    values.outcomes.forEach((_, index) => {
      nextTouched[`outcome-${index}`] = true;
    });

    setTouched(nextTouched);
    setErrors(nextErrors);

    if (!publicKey) {
      setErrors((current) => ({
        ...current,
        form: "Connect your wallet before creating a market.",
      }));
      return;
    }

    if (Object.keys(nextErrors).length > 0) return;

    setErrors({});
    setStatus("saving");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/markets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: values.question.trim(),
          endDate: new Date(values.endDateTime).toISOString(),
          outcomes: values.outcomes.map((outcome) => outcome.trim()),
          walletAddress: publicKey,
          tokenAddress: values.tokenAddress.trim(),
          category: values.category,
        }),
      });

      const payload = await response.json().catch(() => ({ error: "Failed to save market." }));
      if (!response.ok) {
        setStatus("idle");
        setErrors({ form: payload.error?.message || payload.error || "Failed to save market." });
        return;
      }

      setStatus("signing");
      await invokeCreateMarketOnChain({
        walletAddress: publicKey,
        marketId: payload.market.id,
        question: values.question.trim(),
        outcomes: values.outcomes.map((outcome) => outcome.trim()),
        endDateTime: values.endDateTime,
        tokenAddress: values.tokenAddress.trim(),
      });

      setStatus("success");
      onCreated?.(payload.market.id);
    } catch (error: any) {
      setStatus("idle");
      setErrors({ form: error.message || "Failed to sign market creation transaction." });
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-[28px] border border-gray-800 bg-gray-950/90 p-6 md:p-8 shadow-[0_24px_80px_rgba(15,23,42,0.45)]"
    >
      <div className="mb-8 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
          Market Creation
        </span>
        <h1 className="text-3xl font-semibold text-white">Launch a new market</h1>
        <p className="max-w-2xl text-sm leading-6 text-gray-400">
          Save the market metadata first, then approve the Soroban contract invocation in Freighter.
        </p>
      </div>

      <div className="mb-8 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 md:grid-cols-2">
        <div
          data-testid="progress-step-save"
          className={`rounded-2xl border px-4 py-4 ${
            status === "saving"
              ? "border-blue-500 bg-blue-500/10"
              : status === "signing" || status === "success"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-gray-800 bg-gray-950/60"
          }`}
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Step 1</p>
          <p className="mt-2 text-base font-medium text-white">Saving to database</p>
          <p className="mt-1 text-sm text-gray-400">
            {status === "saving"
              ? "Creating the market record..."
              : status === "signing" || status === "success"
                ? "Metadata saved."
                : "POST /api/markets"}
          </p>
        </div>
        <div
          data-testid="progress-step-sign"
          className={`rounded-2xl border px-4 py-4 ${
            status === "signing"
              ? "border-blue-500 bg-blue-500/10"
              : status === "success"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-gray-800 bg-gray-950/60"
          }`}
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Step 2</p>
          <p className="mt-2 text-base font-medium text-white">Signing on-chain</p>
          <p className="mt-1 text-sm text-gray-400">
            {status === "signing"
              ? "Approve the Soroban invocation in Freighter."
              : status === "success"
                ? "On-chain invocation submitted."
                : "Freighter contract invocation"}
          </p>
        </div>
      </div>

      {!publicKey ? (
        <div className="mb-6 rounded-2xl border border-amber-700/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            Connect an admin wallet before submitting the market.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {connecting ? "Connecting..." : "Connect Freighter"}
          </button>
        </div>
      ) : null}

      <div className="grid gap-6">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-gray-200">Question</span>
          <textarea
            value={values.question}
            onChange={(event) => setField("question", event.target.value)}
            onBlur={() => handleBlur("question")}
            rows={4}
            className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
            placeholder="Will BTC trade above $120k before the end of Q4?"
          />
          {touched.question && errors.question ? (
            <span className="text-sm text-red-400">{errors.question}</span>
          ) : null}
        </label>

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Outcomes</span>
            <button
              type="button"
              onClick={addOutcome}
              disabled={values.outcomes.length >= 8}
              className="rounded-full border border-gray-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-200 disabled:opacity-40"
            >
              Add outcome
            </button>
          </div>
          {values.outcomes.map((outcome, index) => (
            <div key={index} className="grid gap-2">
              <div className="flex gap-3">
                <input
                  value={outcome}
                  onChange={(event) => setOutcome(index, event.target.value)}
                  onBlur={() => handleBlur(`outcome-${index}`)}
                  className="flex-1 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
                  placeholder={`Outcome ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeOutcome(index)}
                  disabled={values.outcomes.length <= 2}
                  className="rounded-2xl border border-gray-800 px-4 py-3 text-sm text-gray-300 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              {touched[`outcome-${index}`] && errors.outcomes?.[index] ? (
                <span className="text-sm text-red-400">{errors.outcomes[index]}</span>
              ) : null}
            </div>
          ))}
          {!errors.outcomes?.length || errors.outcomes.length <= values.outcomes.length ? null : (
            <span className="text-sm text-red-400">{errors.outcomes[0]}</span>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-gray-200">End date and time</span>
            <input
              type="datetime-local"
              value={values.endDateTime}
              onChange={(event) => setField("endDateTime", event.target.value)}
              onBlur={() => handleBlur("endDateTime")}
              className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
            />
            {touched.endDateTime && errors.endDateTime ? (
              <span className="text-sm text-red-400">{errors.endDateTime}</span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-gray-200">Category</span>
            <select
              value={values.category}
              onChange={(event) => setField("category", event.target.value as Category)}
              onBlur={() => handleBlur("category")}
              className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {touched.category && errors.category ? (
              <span className="text-sm text-red-400">{errors.category}</span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-gray-200">Token address</span>
          <input
            value={values.tokenAddress}
            onChange={(event) => setField("tokenAddress", event.target.value)}
            onBlur={() => handleBlur("tokenAddress")}
            className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
            placeholder="G..."
          />
          {touched.tokenAddress && errors.tokenAddress ? (
            <span className="text-sm text-red-400">{errors.tokenAddress}</span>
          ) : null}
        </label>
      </div>

      {errors.form ? (
        <div className="mt-6 rounded-2xl border border-red-900/60 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errors.form}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "saving" || status === "signing"}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {status === "saving"
            ? "Saving..."
            : status === "signing"
              ? "Waiting for Freighter..."
              : "Create market"}
        </button>
        {status === "success" ? (
          <span className="text-sm font-medium text-emerald-400">
            Market created successfully.
          </span>
        ) : null}
      </div>
    </form>
  );
}
