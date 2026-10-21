// Starting points for project documentation. Page bodies are markdown; anything still to write is marked
// with TODO_MARKER so the docs tab can count what's left. Kept out of "use client" files: only the server
// reads the bodies, the browser gets names and counts.

export const TODO_MARKER = "[DO UZUPEŁNIENIA";

export type DocTemplate = {
  id: string;
  name: string;
  description: string;
  pages: { title: string; bodyMd: string }[];
  /** Standard open questions every project of this kind has to settle. */
  questions: { question: string; detailsMd?: string; owner?: string; whereInDocs?: string }[];
};

const todo = (what = "") => (what ? `${TODO_MARKER}: ${what}]` : `${TODO_MARKER}]`);

// Mermaid classes shared by every diagram, so the colour legend means the same thing everywhere.
const CLASS_DEFS = `classDef ok fill:#dcefe2,stroke:#3f7d55,color:#14261b,stroke-width:1px
classDef chg fill:#fbe7c6,stroke:#b7791f,color:#2e1f05,stroke-width:1.5px
classDef new fill:#d9e6fb,stroke:#3b67b5,color:#0f1c33,stroke-width:1.5px
classDef later fill:#eeeeee,stroke:#8a8a8a,color:#333333,stroke-dasharray:5 4
classDef ref fill:#ffffff,stroke:#6b6b6b,color:#222222,stroke-dasharray:2 2`;

const AUTOMATION_PAGES: DocTemplate["pages"] = [
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

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: "automation-pl",
    name: "Automation / AI handover (PL)",
    description: "Handover docs for an n8n / AI agent project: architecture, flows, data, security, client manual, acceptance.",
    pages: AUTOMATION_PAGES,
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
