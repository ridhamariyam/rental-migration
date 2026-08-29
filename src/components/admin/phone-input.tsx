"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countries, flagEmoji } from "@/lib/countries";

const DEFAULT_DIAL_CODE = "+91";

/** Splits a combined value like "+91 90000 00000" back into the select's
 * dial code and the input's local number, so re-opening/re-rendering the
 * form (e.g. after a validation error) shows the right country. */
function splitPhone(value: string): { dialCode: string; number: string } {
  const sorted = [...countries].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  const match = sorted.find((country) => value.startsWith(country.dialCode));

  if (!match) {
    return { dialCode: DEFAULT_DIAL_CODE, number: value.trim() };
  }

  return {
    dialCode: match.dialCode,
    number: value.slice(match.dialCode.length).trim(),
  };
}

/**
 * Country-code select (flag + dial code) + a plain number input, composed
 * into the single string the `phone` field actually stores (e.g.
 * "+91 90000 00000") — the backend/schema only ever sees one string, this
 * component just makes entering it less error-prone.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  allowEmpty = false,
  countryLabel = "Country code",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  /** When true, clearing the number resets the whole value to "" instead of
   * leaving just the dial code behind — for optional phone fields, where a
   * bare dial code with no digits should count as "not provided". */
  allowEmpty?: boolean;
  /** Accessible name for the country-code select — override when more than
   * one `PhoneInput` appears on the same page so screen readers don't hear
   * the same generic "Country code" label twice. */
  countryLabel?: string;
}) {
  const { dialCode, number } = useMemo(() => splitPhone(value), [value]);

  function compose(nextDialCode: string, nextNumber: string): string {
    if (allowEmpty && nextNumber.trim() === "") {
      return "";
    }
    return `${nextDialCode} ${nextNumber}`.trim();
  }

  return (
    <div className="flex gap-2">
      <Select
        value={dialCode}
        onValueChange={(nextDialCode) => {
          if (nextDialCode) {
            onChange(compose(nextDialCode, number));
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-27 shrink-0" aria-label={countryLabel}>
          <SelectValue>
            {(selectedDialCode: string) => {
              const country = countries.find(
                (candidate) => candidate.dialCode === selectedDialCode,
              );
              return (
                <span className="flex items-center gap-1.5">
                  {country ? (
                    <span aria-hidden="true">{flagEmoji(country.iso2)}</span>
                  ) : null}
                  <span>{selectedDialCode}</span>
                </span>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {countries.map((country) => (
            <SelectItem
              key={country.iso2}
              value={country.dialCode}
              className="gap-2"
            >
              <span aria-hidden="true">{flagEmoji(country.iso2)}</span>
              <span className="text-muted-foreground">{country.dialCode}</span>
              <span className="sr-only">{country.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-invalid={invalid}
        disabled={disabled}
        value={number}
        onChange={(event) => onChange(compose(dialCode, event.target.value))}
        onBlur={onBlur}
        placeholder="90000 00000"
        className="flex-1"
      />
    </div>
  );
}
