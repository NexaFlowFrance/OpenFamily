-- Up Migration
-- "Jardin & Pelouse" module: manage garden zones (front/back lawn, vegetable
-- patch, flower beds), the plants growing in them, recurring care tasks
-- (watering, mowing, fertilizing…) and an observation log to track lawn/plant
-- health over time.
--
-- Mirrors the house_* modules: free-form VARCHAR for enum-like columns (the API
-- enforces the enum via zod, so adding a value never needs a migration),
-- user_id scoping with ON DELETE CASCADE, and the shared update_updated_at_column
-- trigger from the initial schema.
--
-- Recurrence policy (garden_care): unlike house_maintenance (months), garden
-- cycles are short, so recurrence is expressed in DAYS. When a care row gets its
-- performed_date set (NULL→date transition) AND has a non-null recurrence_days,
-- the route layer inserts the next planned occurrence at performed_date + N days.

CREATE TABLE IF NOT EXISTS garden_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    -- 'Pelouse', 'Potager', 'Massif fleuri', 'Verger', 'Haie', 'Autre'
    zone_type VARCHAR(32) NOT NULL,
    -- 'Devant', 'Derrière', 'Côté', 'Autour', 'Autre'
    location VARCHAR(32),
    area_m2 NUMERIC(10, 2),
    -- 'Plein soleil', 'Mi-ombre', 'Ombre'
    sun_exposure VARCHAR(24),
    soil_type VARCHAR(60),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_garden_zones_user ON garden_zones(user_id);

CREATE TABLE IF NOT EXISTS garden_plants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Plants outlive the zone they were filed under; keep them on zone delete.
    zone_id UUID REFERENCES garden_zones(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    -- 'Légume', 'Fleur', 'Arbre', 'Arbuste', 'Aromatique', 'Gazon', 'Autre'
    plant_type VARCHAR(32) NOT NULL,
    variety VARCHAR(120),
    planted_date DATE,
    watering_frequency_days INTEGER,
    -- 'En bonne santé', 'À surveiller', 'Malade', 'Mort'
    health_status VARCHAR(24) NOT NULL DEFAULT 'En bonne santé',
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_garden_plants_user ON garden_plants(user_id);
CREATE INDEX IF NOT EXISTS idx_garden_plants_zone ON garden_plants(zone_id)
    WHERE zone_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS garden_care (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Care can target a whole zone (mow the front lawn), a single plant
    -- (water the tomato), or neither (generic reminder). Both nullable.
    zone_id UUID REFERENCES garden_zones(id) ON DELETE SET NULL,
    plant_id UUID REFERENCES garden_plants(id) ON DELETE SET NULL,
    -- 'Arrosage', 'Tonte', 'Fertilisation', 'Taille', 'Désherbage',
    -- 'Traitement', 'Inspection', 'Plantation', 'Récolte'
    care_type VARCHAR(32) NOT NULL,
    title VARCHAR(120) NOT NULL,
    planned_date DATE,
    performed_date DATE,
    cost NUMERIC(10, 2),
    -- When set, completing this care triggers the route to INSERT the next
    -- planned occurrence at performed_date + N days.
    recurrence_days INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- A row is either planned, historical, or both — never empty.
    CONSTRAINT garden_care_dates_present
        CHECK (planned_date IS NOT NULL OR performed_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_garden_care_user ON garden_care(user_id);
CREATE INDEX IF NOT EXISTS idx_garden_care_zone ON garden_care(zone_id)
    WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_garden_care_plant ON garden_care(plant_id)
    WHERE plant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_garden_care_planned ON garden_care(user_id, planned_date)
    WHERE planned_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS garden_observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id UUID REFERENCES garden_zones(id) ON DELETE SET NULL,
    plant_id UUID REFERENCES garden_plants(id) ON DELETE SET NULL,
    observed_at DATE NOT NULL DEFAULT CURRENT_DATE,
    -- 'En bonne santé', 'À surveiller', 'Malade', 'Mort'
    health_status VARCHAR(24),
    height_cm NUMERIC(6, 1),
    notes TEXT,
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_garden_observations_user ON garden_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_garden_observations_zone ON garden_observations(zone_id)
    WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_garden_observations_plant ON garden_observations(plant_id)
    WHERE plant_id IS NOT NULL;

-- updated_at triggers reuse the existing function from the initial schema.
CREATE TRIGGER update_garden_zones_updated_at
    BEFORE UPDATE ON garden_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_garden_plants_updated_at
    BEFORE UPDATE ON garden_plants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_garden_care_updated_at
    BEFORE UPDATE ON garden_care
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Down Migration
DROP TRIGGER IF EXISTS update_garden_care_updated_at ON garden_care;
DROP TRIGGER IF EXISTS update_garden_plants_updated_at ON garden_plants;
DROP TRIGGER IF EXISTS update_garden_zones_updated_at ON garden_zones;
DROP TABLE IF EXISTS garden_observations;
DROP TABLE IF EXISTS garden_care;
DROP TABLE IF EXISTS garden_plants;
DROP TABLE IF EXISTS garden_zones;
