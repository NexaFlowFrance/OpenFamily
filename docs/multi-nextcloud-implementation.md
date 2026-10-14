# Multi Nextcloud Calendar Mapping

## Status

Migration 0006 erfolgreich

Neue Tabellen:

- integration_calendars

Neue Appointment Felder:

- source_integration_id
- source_calendar_id

## Ziel

Mehrere Nextcloud Connectoren

Beispiele:

- Papa Nextcloud
- Mama Nextcloud
- Familie Nextcloud

## Architektur

Connector
 ↓
Kalender
 ↓
family_member_ids
 ↓
Appointments
 ↓
Kiosk

## Kalender

integration_calendars

- integration_id
- calendar_href
- calendar_name
- color
- family_member_ids
- enabled

## Appointments

source_integration_id
source_calendar_id

family_member_ids bleibt bestehen.

## Kiosk

Kickboxen

🔵 Papa

## Offene Punkte

Phase 2
- discoverCalendars persistieren

Phase 3
- Kalenderzuordnung
- family_member_ids

Phase 4
- Kiosk Anzeige
