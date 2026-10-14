# Phase 2 Discovery

Aktuell:

discoverCalendars()
    -> string[]

Beispiel:

/privat/
/arbeit/
/familie/

Problem:

Kalendername geht verloren
Kalenderfarbe geht verloren

Neue Struktur:

type DiscoveredCalendar = {
  href: string;
  name: string;
  color?: string;
};

discoverCalendars()
    -> DiscoveredCalendar[]

Persistierung:

integration_calendars

- integration_id
- calendar_href
- calendar_name
- color
- family_member_ids
- enabled

Nächster Schritt:

PROPFIND erweitern

displayname lesen

calendar-color lesen

Persistierung implementieren
