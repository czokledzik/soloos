// Starting points for project documentation. Page bodies are markdown; anything still to write is marked
// with one of TODO_MARKERS so the docs tab can count what's left. Kept out of "use client" files: only the
// server reads the bodies, the browser gets names and counts.

const TODO_EN = "[TO FILL IN";
const TODO_PL = "[DO UZUPEŁNIENIA";
/** Placeholder openings in every template language; all are counted as "left to fill". */
export const TODO_MARKERS = [TODO_EN, TODO_PL];

export type DocTemplate = {
  id: string;
  name: string;
  /** Short label for the button, e.g. "EN". */
  short: string;
  description: string;
  pages: { title: string; bodyMd: string }[];
  /** Standard open questions every project of this kind has to settle. */
  questions: { question: string; detailsMd?: string; owner?: string; whereInDocs?: string }[];
};

const placeholder = (marker: string) => (what = "") => (what ? `${marker}: ${what}]` : `${marker}]`);
const todo = placeholder(TODO_PL);

// Mermaid classes shared by every diagram, so the colour legend means the same thing everywhere.
const CLASS_DEFS = `classDef ok fill:#dcefe2,stroke:#3f7d55,color:#14261b,stroke-width:1px
classDef chg fill:#fbe7c6,stroke:#b7791f,color:#2e1f05,stroke-width:1.5px
classDef new fill:#d9e6fb,stroke:#3b67b5,color:#0f1c33,stroke-width:1.5px
classDef later fill:#eeeeee,stroke:#8a8a8a,color:#333333,stroke-dasharray:5 4
classDef ref fill:#ffffff,stroke:#6b6b6b,color:#222222,stroke-dasharray:2 2`;

const AUTOMATION_PAGES_PL: DocTemplate["pages"] = [
  {
    title: "1. Przegląd i architektura",
    bodyMd: `Stan na: ${todo("DD.MM.RRRR")}

## Wprowadzenie

${todo("2–4 zdania z perspektywy biznesu klienta: co automatyzujemy, dla kogo i po co. Bez szczegółów technicznych.")}

## Przed i po wdrożeniu

| | Przed wdrożeniem | Po wdrożeniu |
|---|---|---|
| Kto obsługuje | ${todo("np. biuro ręcznie")} | ${todo("np. bot, biuro tylko zgłoszenia")} |
| Czas reakcji | ${todo()} | ${todo()} |
| Co zostaje ręczne | — | ${todo()} |

\`\`\`mermaid
flowchart LR
  subgraph PRZED["Przed"]
    A1([Zdarzenie]) --> B1[Ręczna obsługa]
  end
  subgraph PO["Po"]
    A2([Zdarzenie]) --> B2[Automatyzacja] --> C2[Wynik]
  end
\`\`\`

## Architektura

\`\`\`mermaid
flowchart LR
  U([Użytkownik / zdarzenie]) --> F[Kanał wejściowy]
  F --> N[Platforma automatyzacji]
  N --> D[(Dane klienta)]
  N --> O[Wynik / zapis]
\`\`\`

| Element | Rola |
|---|---|
| ${todo("system")} | ${todo("co robi w tym rozwiązaniu")} |

## Przepływ end-to-end (skrót)

1. ${todo("wyzwalacz → pierwszy workflow → co się dzieje")}
2. ${todo("…")}

## Zdarzenia (co uruchamia system)

| Zdarzenie | Reakcja systemu | Workflow / narzędzie |
|---|---|---|
| ${todo("np. telefon po 16:00, nowy e-mail, cron 4:00")} | ${todo()} | ${todo()} |
| Błąd w workflowie | Powiadomienie (strona „7. Awarie i kontakt”) | Error handler |

## Użytkownicy

| Kto | Czego potrzebuje | Co może |
|---|---|---|
| ${todo("np. klient końcowy, zespół klienta, administrator")} | ${todo()} | ${todo()} |

## Użyte technologie

| Technologia | Rola w projekcie | Konto należy do |
|---|---|---|
| ${todo("np. n8n (hosting)")} | ${todo()} | ${todo("klient / wykonawca")} |

## Poza zakresem

- ${todo("czego rozwiązanie świadomie NIE robi (chroni przed dorzucaniem zakresu przy odbiorze)")}

## Słownik pojęć

| Pojęcie | Znaczenie w tym projekcie |
|---|---|
| ${todo("pojęcia, które klient i system rozumieją różnie")} | ${todo()} |
`,
  },
  {
    title: "2. Przebieg procesu",
    bodyMd: `**Legenda statusu:** ✅ wdrożone · 🟡 częściowe / w testach · 🔵 planowane · ❌ nie robimy

**Legenda kolorów diagramów:** 🟩 działało wcześniej · 🟦 nowe · 🟧 zmienione · ⬜ szary przerywany – na przyszłość · biały przerywany – odnośnik do innego diagramu.

Pod każdym diagramem jest **stan wdrożenia**: czym działający system różni się od diagramu.

## Diagram 1. Przebieg główny

\`\`\`mermaid
flowchart TD
  A(["Start"]) --> B["Krok"]
  B --> C{"Decyzja"}
  C -- "tak" --> D["Ścieżka A"]
  C -- "nie" --> E["Ścieżka B"]
  E -. "przyszłość" .-> F["Pomysł"]
  class A ok
  class B,C,D new
  class E chg
  class F later

${CLASS_DEFS}
\`\`\`

**Stan wdrożenia:** ${todo("zgodny / różnice względem diagramu")}

## Diagram 2. Obsługa błędów

\`\`\`mermaid
flowchart TD
  A["Workflow kończy się błędem"] --> B["Error handler"]
  B --> C["Powiadomienie: kanał i adresat"]
  B -. "opcjonalnie" .-> D["Informacja dla klienta / użytkownika"]
  class A,B,C new
  class D later

${CLASS_DEFS}
\`\`\`

**Stan wdrożenia:** ${todo()}

## Tabele decyzyjne

Logikę typu „jeśli X i Y, to Z” najlepiej opisywać tabelą: każda kombinacja warunków ma jedną reakcję.

| Warunek 1 | Warunek 2 | Reakcja systemu | Komunikat |
|---|---|---|---|
| ${todo()} | ${todo()} | ${todo()} | ${todo()} |

Reguły, które obowiązują w całym projekcie (np. „bot nie podaje cen”), są w zakładce **Questions & rules**, z kodem BR-xx i decyzją, z której wynikają.
`,
  },
  {
    title: "3. Workflowy i integracje",
    bodyMd: `Instancja: ${todo("adres platformy")}. Błędy workflowów zgłasza: ${todo("nazwa error handlera")}.

## Workflowy

Powtórz dla każdego workflowu, w kolejności: wejście → orkiestracja → podprocesy → wyjście → zadania cykliczne → obsługa błędów.

### ${todo("nazwa workflowu")}
- **Wyzwalacz:** ${todo("webhook / cron / zdarzenie / narzędzie agenta")}
- **Wejście:** ${todo("pola")}
- **Działanie:** ${todo("1–3 zdania")}
- **Wyjście:** ${todo("pola / zapis / odpowiedź")}
- **Gdy się nie uda:** ${todo("co widzi użytkownik, kto dostaje powiadomienie")}

Przykład danych (bez danych osobowych):

\`\`\`json
{ "wejście": "…" }
\`\`\`

## Agent AI / prompty

| Ustawienie | Wartość |
|---|---|
| Model (i zapasowy) | ${todo()} |
| Baza wiedzy | ${todo("pliki, data wersji")} |
| Najważniejsze zasady w prompcie | ${todo("kody reguł BR-xx")} |

### Historia zmian promptu i konfiguracji

| Data | Co zmieniono | Dlaczego |
|---|---|---|
| ${todo()} | ${todo()} | ${todo("decyzja / błąd / test")} |

## Kod niestandardowy

Tylko to, czego nie widać w zwykłych węzłach: parsery, dopasowania, obliczenia, progi.

### ${todo("nazwa węzła / funkcji")}
${todo("co robi, wejście i wyjście, ważne stałe (progi, wagi) i dlaczego takie")}
`,
  },
  {
    title: "4. Dane i magazyny",
    bodyMd: `## ${todo("nazwa magazynu, np. tabela w Baserow / PostgreSQL / Data Table")}

${todo("rola w systemie: kto czyta, kto zapisuje")}

| Pole | Typ | Źródło | Znaczenie / dozwolone wartości |
|---|---|---|---|
| ${todo()} | ${todo()} | ${todo()} | ${todo()} |

**Odświeżanie:** ${todo("na bieżąco / cyklicznie (kiedy) / ręcznie / pełne przeładowanie / przyrostowe")}

**Przechowywanie (retencja):** ${todo("jak długo, kto usuwa")}

## Pliki i nagrania

${todo("gdzie leżą, jak nazwane, kto ma dostęp")}
`,
  },
  {
    title: "5. Bezpieczeństwo, dostępy i RODO",
    bodyMd: `Hasła i klucze **nie są przechowywane w dokumentacji**. Przekazujemy je osobnym kanałem (jednorazowy link, menedżer haseł).

## Konta i dostępy

| Usługa | Właściciel konta | Rodzaj poświadczenia | Gdzie zapisane | Dostęp wykonawcy | Po odbiorze |
|---|---|---|---|---|---|
| ${todo()} | ${todo("klient / wykonawca")} | ${todo("OAuth / klucz API / login")} | ${todo("np. credentials n8n")} | ${todo()} | ${todo("zmiana hasła / usunięcie dostępu")} |

## Zabezpieczenia w logice

Zasady, które chronią dane i klienta (szczegóły i źródła w **Questions & rules**):

- ${todo("np. BR-03: dane finansowe tylko po potwierdzeniu NIP")}

## Zabezpieczenia techniczne

- Autoryzacja webhooków: ${todo("nagłówek / podpis / brak")}
- Walidacja danych wejściowych: ${todo()}

## RODO

| Kwestia | Ustalenie |
|---|---|
| Jakie dane osobowe są przetwarzane | ${todo()} |
| Informacja dla osoby (np. o nagrywaniu) | ${todo()} |
| Okres przechowywania | ${todo()} |
| Podmioty przetwarzające (dostawcy) | ${todo()} |

## Wymagania niefunkcjonalne

| Obszar | Wymaganie | Jak sprawdzone |
|---|---|---|
| Dostępność | ${todo("kiedy system działa")} | ${todo()} |
| Czas odpowiedzi | ${todo()} | ${todo()} |
| Koszt | ${todo("limit na rozmowę / miesiąc")} | ${todo()} |
`,
  },
  {
    title: "6. Instrukcja dla zespołu klienta",
    bodyMd: `## Kiedy działa

${todo("godziny, dni; jak włączyć i wyłączyć bez udziału wykonawcy")}

## Codzienna obsługa

1. ${todo("gdzie zajrzeć rano, jak filtrować")}
2. ${todo("co zrobić z każdą sprawą")}

## Co system robi, a czego nie

- ${todo("najważniejsze zachowania językiem użytkownika; odwołania do reguł BR-xx")}

## Zmiany treści

| Co zmienić | Gdzie | Kiedy widać zmianę |
|---|---|---|
| ${todo()} | ${todo()} | ${todo("od razu / następnego dnia")} |

## Testowanie

${todo("jak bezpiecznie przetestować; czego nie robić na danych produkcyjnych")}
`,
  },
  {
    title: "7. Awarie i kontakt",
    bodyMd: `## Jak zgłaszane są błędy

${todo("error handler → kanał (e-mail / komunikator) → adresat; czy klient też dostaje powiadomienie")}

## Gdy coś nie działa

| Objaw | Co sprawdzić |
|---|---|
| ${todo()} | ${todo()} |

## Osoby odpowiedzialne

| Sprawy | Kto | Kontakt |
|---|---|---|
| Techniczne | ${todo()} | ${todo()} |
| Biznesowe (po stronie klienta) | ${todo()} | ${todo()} |

## Rejestr incydentów

| Data | Objaw | Przyczyna | Naprawa |
|---|---|---|---|
| | | | |
`,
  },
  {
    title: "8. Koszty i utrzymanie",
    bodyMd: `## Koszty bieżące

Kwoty orientacyjne na ${todo("miesiąc i rok")}; aktualne stawki w panelach usług.

| Usługa | Za co | Koszt | Płaci |
|---|---|---|---|
| ${todo()} | ${todo()} | ${todo()} | ${todo("klient / wykonawca")} |

## Utrzymanie

| Co | Kiedy | Kto |
|---|---|---|
| ${todo("np. kontrola salda, przegląd rozmów, aktualizacja bazy wiedzy")} | ${todo()} | ${todo()} |

## Znane ograniczenia

- ${todo("uczciwa lista: czego system nie potrafi albo robi z opóźnieniem")}

## Możliwości rozwoju

| Możliwość | Warunek | Korzyść |
|---|---|---|
| ${todo()} | ${todo("kiedy / po czym")} | ${todo()} |
`,
  },
  {
    title: "Odbiór: kryteria i testy (wewnętrzne)",
    bodyMd: `Strona robocza do odbioru. Po odbiorze można ją opublikować jako protokół.

## Zakres z oferty a wykonanie

| Pozycja oferty | Status | Co się zmieniło i dlaczego (decyzja / zmiana zakresu) |
|---|---|---|
| ${todo("pozycje z zakładki Scope")} | ✅ / 🟡 / 🔵 / ❌ | ${todo()} |

## Scenariusze testowe

| ID | Scenariusz | Kroki | Oczekiwany wynik | Wynik | Data |
|---|---|---|---|---|---|
| T-01 | ${todo("ścieżka główna")} | ${todo()} | ${todo()} | | |
| T-02 | ${todo("brak danych / błędne dane")} | ${todo()} | ${todo()} | | |
| T-03 | ${todo("błąd usługi zewnętrznej")} | ${todo()} | ${todo("powiadomienie, brak utraty danych")} | | |

## Zestaw testowy dla AI

Te same przypadki po każdej zmianie promptu (testy regresji).

| Wejście / rozmowa | Oczekiwane zachowanie | Oczekiwany status / kategoria | Ostatni wynik |
|---|---|---|---|
| ${todo()} | ${todo()} | ${todo()} | |

## Protokół przekazania

- [ ] Dokumentacja opublikowana w portalu
- [ ] Powiadomienia o błędach trafiają do klienta lub uzgodnionego adresata
- [ ] Dane testowe usunięte (także przykładowe dane zapisane w workflowach)
- [ ] Poświadczenia przekazane osobnym kanałem
- [ ] Klient zmienił hasła do współdzielonych kont; dostępy wykonawcy usunięte lub uzgodnione
- [ ] Instrukcja omówiona z zespołem klienta
- [ ] Otwarte kwestie zamknięte albo przeniesione na kolejny etap
`,
  },
  {
    title: "Ryzyka i założenia (wewnętrzne)",
    bodyMd: `Założenie to ryzyko, które jeszcze się nie spełniło: jeśli okaże się nieprawdziwe, projekt stoi.

| ID | Ryzyko / założenie | Typ | Prawdopodobieństwo | Wpływ | Co robimy | Właściciel | Status |
|---|---|---|---|---|---|---|---|
| R-01 | ${todo()} | ryzyko / założenie | niskie / średnie / wysokie | niski / średni / wysoki | ${todo()} | ${todo()} | otwarte |
`,
  },
];

const td = placeholder(TODO_EN);

const AUTOMATION_PAGES_EN: DocTemplate["pages"] = [
  {
    title: "1. Overview and architecture",
    bodyMd: `As of: ${td("YYYY-MM-DD")}

## Introduction

${td("2–4 sentences from the client's business point of view: what we automate, for whom and why. No technical detail.")}

## Before and after

| | Before | After |
|---|---|---|
| Who handles it | ${td("e.g. the office, by hand")} | ${td("e.g. the bot; the office only gets tickets")} |
| Response time | ${td()} | ${td()} |
| What stays manual | — | ${td()} |

\`\`\`mermaid
flowchart LR
  subgraph BEFORE["Before"]
    A1([Event]) --> B1[Handled by hand]
  end
  subgraph AFTER["After"]
    A2([Event]) --> B2[Automation] --> C2[Result]
  end
\`\`\`

## Architecture

\`\`\`mermaid
flowchart LR
  U([User / event]) --> F[Input channel]
  F --> N[Automation platform]
  N --> D[(Client data)]
  N --> O[Result / record]
\`\`\`

| Component | Role |
|---|---|
| ${td("system")} | ${td("what it does in this solution")} |

## End-to-end flow (short)

1. ${td("trigger → first workflow → what happens")}
2. ${td("…")}

## Events (what starts the system)

| Event | What the system does | Workflow / tool |
|---|---|---|
| ${td("e.g. a call after 4 pm, a new email, a 4 am cron")} | ${td()} | ${td()} |
| A workflow fails | Notification (page "7. Incidents and contacts") | Error handler |

## Users

| Who | What they need | What they can do |
|---|---|---|
| ${td("e.g. end customer, client's team, administrator")} | ${td()} | ${td()} |

## Technology used

| Technology | Role in the project | Account owned by |
|---|---|---|
| ${td("e.g. n8n (hosting)")} | ${td()} | ${td("client / contractor")} |

## Out of scope

- ${td("what the solution deliberately does NOT do (protects against scope creep at acceptance)")}

## Glossary

| Term | Meaning in this project |
|---|---|
| ${td("terms the client and the system understand differently")} | ${td()} |
`,
  },
  {
    title: "2. Process flow",
    bodyMd: `**Status legend:** ✅ live · 🟡 partial / in testing · 🔵 planned · ❌ not doing

**Diagram colours:** 🟩 worked before · 🟦 new · 🟧 changed · ⬜ grey dashed – later · white dashed – link to another diagram.

Under each diagram is its **implementation status**: how the running system differs from the diagram.

## Diagram 1. Main flow

\`\`\`mermaid
flowchart TD
  A(["Start"]) --> B["Step"]
  B --> C{"Decision"}
  C -- "yes" --> D["Path A"]
  C -- "no" --> E["Path B"]
  E -. "later" .-> F["Idea"]
  class A ok
  class B,C,D new
  class E chg
  class F later

${CLASS_DEFS}
\`\`\`

**Implementation status:** ${td("matches / differences from the diagram")}

## Diagram 2. Error handling

\`\`\`mermaid
flowchart TD
  A["Workflow fails"] --> B["Error handler"]
  B --> C["Notification: channel and recipient"]
  B -. "optional" .-> D["Message to the client / user"]
  class A,B,C new
  class D later

${CLASS_DEFS}
\`\`\`

**Implementation status:** ${td()}

## Decision tables

"If X and Y, then Z" logic is best described as a table: every combination of conditions has exactly one outcome.

| Condition 1 | Condition 2 | What the system does | Message |
|---|---|---|---|
| ${td()} | ${td()} | ${td()} | ${td()} |

Rules that apply across the project (e.g. "the bot never quotes prices") live in the **Questions & rules** tab, with a BR-xx code and the decision they came from.
`,
  },
  {
    title: "3. Workflows and integrations",
    bodyMd: `Instance: ${td("platform URL")}. Workflow errors are reported by: ${td("error handler name")}.

## Workflows

Repeat for each workflow, in this order: input → orchestration → sub-processes → output → scheduled jobs → error handling.

### ${td("workflow name")}
- **Trigger:** ${td("webhook / cron / event / agent tool")}
- **Input:** ${td("fields")}
- **What it does:** ${td("1–3 sentences")}
- **Output:** ${td("fields / record / response")}
- **When it fails:** ${td("what the user sees, who gets notified")}

Sample data (no personal data):

\`\`\`json
{ "input": "…" }
\`\`\`

## AI agent / prompts

| Setting | Value |
|---|---|
| Model (and fallback) | ${td()} |
| Knowledge base | ${td("files, version date")} |
| Key rules in the prompt | ${td("BR-xx rule codes")} |

### Prompt and configuration changes

| Date | What changed | Why |
|---|---|---|
| ${td()} | ${td()} | ${td("decision / bug / test")} |

## Custom code

Only what isn't visible in regular nodes: parsers, matching, calculations, thresholds.

### ${td("node / function name")}
${td("what it does, input and output, important constants (thresholds, weights) and why they are what they are")}
`,
  },
  {
    title: "4. Data and storage",
    bodyMd: `## ${td("store name, e.g. a Baserow / PostgreSQL table / Data Table")}

${td("role in the system: who reads, who writes")}

| Field | Type | Source | Meaning / allowed values |
|---|---|---|---|
| ${td()} | ${td()} | ${td()} | ${td()} |

**Refresh:** ${td("live / scheduled (when) / manual / full reload / incremental")}

**Retention:** ${td("how long, who deletes")}

## Files and recordings

${td("where they live, how they're named, who has access")}
`,
  },
  {
    title: "5. Security, access and GDPR",
    bodyMd: `Passwords and keys are **never kept in the documentation**. They are handed over separately (one-time link, password manager).

## Accounts and access

| Service | Account owner | Credential type | Stored in | Contractor access | After handover |
|---|---|---|---|---|---|
| ${td()} | ${td("client / contractor")} | ${td("OAuth / API key / login")} | ${td("e.g. n8n credentials")} | ${td()} | ${td("password changed / access removed")} |

## Safeguards in the logic

Rules that protect the data and the client (details and sources in **Questions & rules**):

- ${td("e.g. BR-03: financial data only after the tax ID is confirmed")}

## Technical safeguards

- Webhook authorization: ${td("header / signature / none")}
- Input validation: ${td()}

## GDPR

| Topic | Agreed |
|---|---|
| What personal data is processed | ${td()} |
| Notice to the person (e.g. about recording) | ${td()} |
| Retention period | ${td()} |
| Processors (vendors) | ${td()} |

## Non-functional requirements

| Area | Requirement | How it was checked |
|---|---|---|
| Availability | ${td("when the system runs")} | ${td()} |
| Response time | ${td()} | ${td()} |
| Cost | ${td("limit per conversation / month")} | ${td()} |
`,
  },
  {
    title: "6. Guide for the client's team",
    bodyMd: `## When it runs

${td("hours, days; how to switch it on and off without the contractor")}

## Day-to-day

1. ${td("where to look in the morning, how to filter")}
2. ${td("what to do with each case")}

## What the system does and doesn't do

- ${td("the key behaviours in the user's words; refer to BR-xx rules")}

## Changing content

| What to change | Where | When the change shows |
|---|---|---|
| ${td()} | ${td()} | ${td("immediately / next day")} |

## Testing

${td("how to test safely; what not to do with production data")}
`,
  },
  {
    title: "7. Incidents and contacts",
    bodyMd: `## How errors are reported

${td("error handler → channel (email / chat) → recipient; does the client get notified too")}

## When something doesn't work

| Symptom | What to check |
|---|---|
| ${td()} | ${td()} |

## Who's responsible

| Area | Who | Contact |
|---|---|---|
| Technical | ${td()} | ${td()} |
| Business (client side) | ${td()} | ${td()} |

## Incident log

| Date | Symptom | Cause | Fix |
|---|---|---|---|
| | | | |
`,
  },
  {
    title: "8. Costs and maintenance",
    bodyMd: `## Running costs

Approximate amounts per ${td("month and year")}; current prices are in each service's dashboard.

| Service | For what | Cost | Paid by |
|---|---|---|---|
| ${td()} | ${td()} | ${td()} | ${td("client / contractor")} |

## Maintenance

| What | When | Who |
|---|---|---|
| ${td("e.g. check the balance, review conversations, update the knowledge base")} | ${td()} | ${td()} |

## Known limitations

- ${td("an honest list: what the system can't do, or does with a delay")}

## Possible next steps

| Option | Condition | Benefit |
|---|---|---|
| ${td()} | ${td("when / after what")} | ${td()} |
`,
  },
  {
    title: "Acceptance: criteria and tests (internal)",
    bodyMd: `Working page for acceptance. After sign-off it can be published as the acceptance record.

## Proposal scope vs. delivered

| Proposal item | Status | What changed and why (decision / scope change) |
|---|---|---|
| ${td("items from the Scope tab")} | ✅ / 🟡 / 🔵 / ❌ | ${td()} |

## Test scenarios

| ID | Scenario | Steps | Expected result | Result | Date |
|---|---|---|---|---|---|
| T-01 | ${td("main path")} | ${td()} | ${td()} | | |
| T-02 | ${td("missing / wrong data")} | ${td()} | ${td()} | | |
| T-03 | ${td("external service fails")} | ${td()} | ${td("notification, no data lost")} | | |

## AI test set

The same cases after every prompt change (regression tests).

| Input / conversation | Expected behaviour | Expected status / category | Last result |
|---|---|---|---|
| ${td()} | ${td()} | ${td()} | |

## Handover checklist

- [ ] Documentation published on the portal
- [ ] Error notifications reach the client or the agreed recipient
- [ ] Test data removed (including sample data pinned in workflows)
- [ ] Credentials handed over separately
- [ ] Client changed passwords on shared accounts; contractor access removed or agreed
- [ ] Guide walked through with the client's team
- [ ] Open questions closed or moved to the next phase
`,
  },
  {
    title: "Risks and assumptions (internal)",
    bodyMd: `An assumption is a risk that hasn't happened yet: if it turns out to be false, the project stalls.

| ID | Risk / assumption | Type | Likelihood | Impact | What we do | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-01 | ${td()} | risk / assumption | low / medium / high | low / medium / high | ${td()} | ${td()} | open |
`,
  },
];

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: "automation-en",
    name: "Automation / AI handover",
    short: "EN",
    description: "Handover docs for an n8n / AI agent project: architecture, flows, data, security, client manual, acceptance.",
    pages: AUTOMATION_PAGES_EN,
    questions: [
      { question: "Where should error notifications go, and should the client get them too?", owner: "client", whereInDocs: "7. Incidents and contacts" },
      {
        question: "How long do we keep data, recordings and logs, and do people have to be told about it (GDPR)?",
        owner: "client",
        whereInDocs: "5. Security, access and GDPR",
      },
      { question: "Whose accounts do the paid services run on, and who keeps an eye on the balance?", owner: "client", whereInDocs: "8. Costs and maintenance" },
      { question: "Who signs off on acceptance on the client's side, and based on which tests?", owner: "client", whereInDocs: "Acceptance: criteria and tests" },
      {
        question: "What happens to the contractor's access after handover (maintenance or full handover)?",
        owner: "client",
        whereInDocs: "5. Security, access and GDPR",
      },
    ],
  },
  {
    id: "automation-pl",
    name: "Automation / AI handover (Polish)",
    short: "PL",
    description: "The same handover set in Polish.",
    pages: AUTOMATION_PAGES_PL,
    questions: [
      {
        question: "Dokąd mają trafiać powiadomienia o błędach i czy klient też ma je dostawać?",
        owner: "klient",
        whereInDocs: "7. Awarie i kontakt",
      },
      {
        question: "Jak długo przechowujemy dane, nagrania i logi, i czy użytkownik musi być o tym informowany (RODO)?",
        owner: "klient",
        whereInDocs: "5. Bezpieczeństwo, dostępy i RODO",
      },
      {
        question: "Na czyich kontach działają usługi płatne i kto pilnuje salda?",
        owner: "klient",
        whereInDocs: "8. Koszty i utrzymanie",
      },
      {
        question: "Kto po stronie klienta akceptuje odbiór i na podstawie jakich testów?",
        owner: "klient",
        whereInDocs: "Odbiór: kryteria i testy",
      },
      {
        question: "Co dzieje się z dostępami wykonawcy po odbiorze (utrzymanie czy przekazanie)?",
        owner: "klient",
        whereInDocs: "5. Bezpieczeństwo, dostępy i RODO",
      },
    ],
  },
];
