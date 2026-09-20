import { Link } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import type { Contact } from "@/lib/contacts";
import { COLUMN_SORT_KEY, statusLabel } from "@/lib/table-columns";
import { t as tr } from "@/lib/i18n";

/**
 * Zawartość jednej komórki listy kontaktów, wybierana kluczem kolumny.
 *
 * Jedno miejsce dla obu modułów — Kontaktów i Kontaktów telefonicznych. Gdyby
 * każdy renderował po swojemu, ta sama kolumna zaczęłaby z czasem wyglądać
 * inaczej w zależności od tego, którą listę ktoś otworzył.
 *
 * **Kolumny złożone** (`name`, `contact`, `source`, `consents`) łączą po kilka
 * pól, bo tak wygląda ta tabela od początku i tak działa sortowanie: klucze
 * sortowania serwera to właśnie te kolumny, nie pojedyncze pola.
 */

const dash = <span className="text-muted-foreground">—</span>;

/**
 * `variant="phone"` przestawia dwie kolumny na wygląd modułu telefonicznego:
 * numer jest tam **tożsamością** kontaktu (z ikoną i PRM ID), a brak nazwiska
 * jest stanem normalnym, który trzeba nazwać wprost — nie pustką.
 */
export function ContactCell({
  colKey,
  contact: c,
  variant = "contacts",
}: {
  colKey: string;
  contact: Contact;
  variant?: "contacts" | "phone";
}) {
  switch (colKey) {
    case "name":
      if (variant === "phone") {
        return (
          <TableCell>
            {c.firstName || c.lastName ? (
              <span className="text-sm">
                {c.firstName} {c.lastName}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">{tr("nieuzupełnione")}</span>
            )}
          </TableCell>
        );
      }
      return (
        <TableCell className="font-medium">
          <Link
            to="/contacts/$id"
            params={{ id: c.id }}
            className="flex items-center gap-3 hover:text-primary"
          >
            <div className="h-8 w-8 rounded-full bg-primary-soft flex items-center justify-center text-[11px] font-semibold text-primary">
              {c.firstName[0]}
              {c.lastName[0]}
            </div>
            <div className="flex flex-col leading-tight">
              <span>
                {c.firstName} {c.lastName}
              </span>
              {c.pesel ? (
                <span className="text-xs text-muted-foreground font-normal">
                  {tr("PESEL ")} {c.pesel}
                </span>
              ) : null}
            </div>
          </Link>
        </TableCell>
      );

    case "contact":
      return (
        <TableCell>
          {/* Ograniczone i przewijalne z tego samego powodu co na karcie
              kontaktu: adres e-mail się nie łamie, więc bez limitu jeden długi
              rozpycha całą kolumnę. */}
          <div className="flex max-w-[16rem] flex-col text-xs leading-snug">
            <span className="overflow-x-auto whitespace-nowrap pb-0.5" title={c.email}>
              {c.email}
            </span>
            <span className="text-muted-foreground">{c.phone}</span>
          </div>
        </TableCell>
      );

    case "email":
      return (
        <TableCell className="text-xs">
          <span className="block max-w-[16rem] overflow-x-auto whitespace-nowrap" title={c.email}>
            {c.email || dash}
          </span>
        </TableCell>
      );

    case "phone":
      if (variant === "phone") {
        return (
          <TableCell className="font-medium">
            <Link
              to="/contacts/$id"
              params={{ id: c.id }}
              className="flex items-center gap-3 hover:text-primary"
            >
              <div className="h-8 w-8 rounded-full bg-primary-soft flex items-center justify-center text-primary shrink-0">
                <Phone className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col leading-tight">
                <span>{c.phone}</span>
                <span className="text-xs text-muted-foreground font-normal">{c.prmId}</span>
              </div>
            </Link>
          </TableCell>
        );
      }
      return <TableCell className="whitespace-nowrap text-xs">{c.phone || dash}</TableCell>;

    case "prmId":
      return <TableCell className="whitespace-nowrap text-xs">{c.prmId}</TableCell>;

    case "pesel":
      return <TableCell className="whitespace-nowrap text-xs">{c.pesel || dash}</TableCell>;

    case "status": {
      const st = statusLabel[c.status];
      return (
        <TableCell>
          <Badge variant="outline" className={st?.cls}>
            {st?.label ?? c.status}
          </Badge>
        </TableCell>
      );
    }

    case "consents":
      return (
        <TableCell className="whitespace-nowrap text-xs">
          {c.consentEmail === 1 || c.consentSms === 1 ? (
            <span className="text-success">
              {[
                c.consentEmail === 1 ? "e-mail" : null,
                c.consentSms === 1 ? "SMS" : null,
                c.consentProfiling === 1 ? "profil." : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : (
            <span className="text-muted-foreground">{tr("brak")}</span>
          )}
        </TableCell>
      );

    case "segments":
      return (
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {c.segments.length === 0
              ? dash
              : c.segments.map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">
                    {s}
                  </Badge>
                ))}
          </div>
        </TableCell>
      );

    case "tags":
      return (
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {c.tags.length === 0
              ? dash
              : c.tags.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal">
                    {t}
                  </Badge>
                ))}
          </div>
        </TableCell>
      );

    case "source":
      return (
        <TableCell>
          <div className="flex flex-col text-xs leading-snug">
            <span>
              {c.source}
              {c.medium ? ` · ${c.medium}` : ""}
            </span>
            <span className="text-muted-foreground">{c.campaign}</span>
          </div>
        </TableCell>
      );

    case "medium":
      return <TableCell className="text-xs">{c.medium || dash}</TableCell>;

    case "campaign":
      return <TableCell className="text-xs">{c.campaign || dash}</TableCell>;

    case "createdAt":
      return (
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {c.createdAt}
        </TableCell>
      );

    default:
      // Pole dodane przez klinikę — wartość leży w `custom_fields` pod kluczem
      // definicji. Nieznany klucz daje myślnik, a nie pustą komórkę: pusto
      // wygląda jak błąd renderowania, myślnik mówi „nie wypełniono".
      return <TableCell className="text-xs">{c.customFields?.[colKey] || dash}</TableCell>;
  }
}
