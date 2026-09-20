import { AuthenticatorCard } from "@/components/settings/AuthenticatorCard";
import { StatusesCard } from "@/components/settings/StatusesCard";
import { EmailSendersCard } from "@/components/settings/EmailSendersCard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  Bot,
  Database,
  Globe,
  Lock,
  Mail,
  Megaphone,
  Palette,
  Plug,
  Radar,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackingTab } from "@/components/settings/TrackingTab";
import { DomainTab } from "@/components/settings/DomainTab";
import { UsersTab } from "@/components/settings/UsersTab";
import { AgentTab } from "@/components/settings/AgentTab";
import { DataFieldsTab } from "@/components/settings/DataFieldsTab";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/auth/roles";
import { versionLabel } from "@/lib/version";
import { t as tr, localized } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: tr("Settings — PRM Core") }] }),
  component: SettingsPage,
});

const tabs = localized(() => [
  { v: "users", label: tr("Użytkownicy"), icon: Users },
  { v: "roles", label: tr("Role"), icon: Shield },
  { v: "data", label: tr("Tabele / Dane"), icon: Database },
  { v: "branding", label: tr("Branding"), icon: Palette },
  { v: "domains", label: tr("Domeny"), icon: Globe },
  { v: "tracking", label: tr("Tracking"), icon: Radar },
  { v: "agent", label: tr("PRM_Agent"), icon: Bot },
  { v: "smtp", label: "SMTP", icon: Mail },
  { v: "integrations", label: tr("Integracje"), icon: Plug },
  { v: "notifications", label: tr("Powiadomienia"), icon: Bell },
  { v: "security", label: tr("Bezpieczeństwo"), icon: Lock },
]);

function SettingsPage() {
  const [tab, setTab] = useState("users");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{tr("Ustawienia")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tr("Konfiguracja workspace PRM Core.")}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto bg-muted/40 p-1">
          {tabs.map((t) => (
            <TabsTrigger key={t.v} value={t.v} className="gap-1.5">
              <t.icon className="h-4 w-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="roles">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">{tr("Role i uprawnienia")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("Rola decyduje o tym, co użytkownik może zrobić w workspace.")}
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                    <ShieldCheck className="h-4.5 w-4.5" />
                  </div>
                  <div className="font-medium">{ROLE_LABELS.admin}</div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{ROLE_DESCRIPTIONS.admin}</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>{tr("Dodawanie i zarządzanie użytkownikami")}</li>
                  <li>{tr("Konfiguracja i weryfikacja domen (Settings → Domeny)")}</li>
                  <li>{tr("Wszystkie moduły Workspace, Engage i System")}</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
                    <Megaphone className="h-4.5 w-4.5" />
                  </div>
                  <div className="font-medium">{ROLE_LABELS.marketing}</div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{ROLE_DESCRIPTIONS.marketing}</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>{tr("Pełny dostęp do kontaktów, automatyzacji i treści")}</li>
                  <li className="text-destructive/80">
                    {tr("Brak dostępu: dodawanie użytkowników")}
                  </li>
                  <li className="text-destructive/80">
                    {tr("Brak dostępu: zmiany techniczne domeny")}
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <StatusesCard />
          <DataFieldsTab />
        </TabsContent>

        <TabsContent value="branding">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">{tr("Branding")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{tr("Nazwa workspace")}</Label>
                <Input defaultValue="PRM Core — Klinika ABC" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Kolor akcentu")}</Label>
                <Input defaultValue="#3B82F6" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains">
          <DomainTab />
        </TabsContent>

        <TabsContent value="agent">
          <AgentTab />
        </TabsContent>

        <TabsContent value="tracking">
          <TrackingTab />
        </TabsContent>

        <TabsContent value="smtp" className="space-y-4">
          <EmailSendersCard />
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">{tr("Konfiguracja SMTP")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{tr("Host")}</Label>
                <Input placeholder="smtp.sendgrid.net" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Port")}</Label>
                <Input placeholder="587" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Użytkownik")}</Label>
                <Input placeholder="apikey" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Hasło")}</Label>
                <Input type="password" placeholder="••••••••" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">{tr("Powiadomienia")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "Nowy lead",
                "Wizyta zaplanowana",
                tr("Wypisanie z newslettera"),
                tr("Błędy automatyzacji"),
              ].map((n) => (
                <div key={n} className="flex items-center justify-between py-1">
                  <span className="text-sm">{n}</span>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Which build is running. Without it, "czy poprawka już weszła?" is
            answered by guessing. */}
        <p className="pt-2 text-xs text-muted-foreground">
          {tr("PRM Core ")} <span className="font-mono">{versionLabel()}</span>
        </p>

        <TabsContent value="security" className="space-y-4">
          <AuthenticatorCard />
        </TabsContent>

        {/* Integracje mają własny ekran od dawna — ta zakładka została po czasach,
            gdy miały tu zamieszkać. „Sekcja w przygotowaniu" sugerowała, że
            czegoś nie ma, choć jest komplet: SendGrid, Twilio, Meta, Canva,
            webhooki, wstrzymanie wymiany z systemem rezerwacji. */}
        <TabsContent value="integrations">
          <Card className="border-border/60 shadow-[var(--shadow-card)]">
            <CardContent className="space-y-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Integracje mają własny ekran — z konfiguracją SendGrida, Twilio, Mety, Canvy i webhooków.",
                )}
              </p>
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/integrations">
                  <Plug className="h-4 w-4" /> {tr(" Otwórz Integracje")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
