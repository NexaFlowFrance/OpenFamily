# Multi Nextcloud Calendar Mapping

## Ziel

Mehrere Nextcloud Connectoren pro Familie.

Beispiele:

- Papa Nextcloud
- Mama Nextcloud
- Familie Nextcloud

## Kalender

Connector
 └ Kalender

Beispiel:

Papa Nextcloud
 ├ Privat
 ├ Arbeit

Mama Nextcloud
 ├ Privat

## Mitglieder

Kalender
 └ family_member_ids

Beispiel:

Privat Paul
 → Papa

Loretta
 → Mama

Klavier
 → Paulina

## Appointment

Neue Felder:

- source_integration_id
- source_calendar_id

family_member_ids bleibt bestehen.

## Kiosk

Kickboxen

🔵 Papa

## Vorteile

- kompatibel mit bestehendem OpenFamily Modell
- keine owner_member_id notwendig
- mehrere Connectoren möglich
- Outlook/Smartphone/Nextcloud bleiben kompatibel
