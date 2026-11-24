"use client";

import { useId, useMemo, useRef, useState } from "react";
import { searchExercises } from "@/lib/exercises";

/**
 * Campo de ejercicio con autocompletar. Sugiere del catálogo y de los ejercicios que el PT ya usó,
 * pero el texto es libre: si no está en la lista, se guarda tal como lo escribió.
 * Patrón ARIA combobox con lista: flechas para moverse, Enter para elegir, Escape para cerrar.
 */
export function ExerciseCombobox({
  label,
  value,
  onChange,
  own,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  own: string[];
}) {
  const uid = useId().replace(/:/g, "");
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => searchExercises(value, own), [value, own]);
  const shown = open && options.length > 0;

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="field relative">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        className="input"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${uid}-opt-${active}` : undefined}
        autoComplete="off"
        maxLength={80}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (options.length === 0 ? -1 : (a + 1) % options.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (options.length === 0 ? -1 : a <= 0 ? options.length - 1 : a - 1));
          } else if (e.key === "Enter" && shown) {
            // Con la lista abierta, Enter elige (o cierra); nunca envía la rutina entera.
            e.preventDefault();
            if (active >= 0) pick(options[active].name);
            else setOpen(false);
          } else if (e.key === "Escape" && shown) {
            e.preventDefault();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Sugerencias para ${label}`}
          className="panel absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={`${o.group}-${o.name}`}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (no click): el campo no pierde el foco antes de elegir.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-ink text-paper" : ""}`}
            >
              <span className="min-w-0 truncate">{o.name}</span>
              <span className={`shrink-0 text-xs ${i === active ? "text-[#9aa7b0]" : "text-muted"}`}>{o.group}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
