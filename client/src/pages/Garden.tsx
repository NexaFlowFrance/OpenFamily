import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getDateFnsLocale } from '../lib/dateLocale';
import {
    Plus,
    Search,
    Sprout,
    Leaf,
    Droplets,
    Eye,
    AlertTriangle,
    CalendarClock,
    Trash2,
} from 'lucide-react';
import {
    Card,
    CardContent,
    Button,
    Input,
    Tabs,
    Dialog,
    Textarea,
    Select,
    DatePicker,
    useToast,
} from '../components/ui';
import EmptyState from '../components/app/EmptyState';
import ZoneCard from '../components/app/ZoneCard';
import PlantCard from '../components/app/PlantCard';
import CareCard from '../components/app/CareCard';
import GardenTipsDialog from '../components/app/GardenTipsDialog';
import {
    GARDEN_ZONE_TYPES,
    GARDEN_LOCATIONS,
    GARDEN_SUN_EXPOSURES,
    GARDEN_PLANT_TYPES,
    GARDEN_HEALTH_STATUSES,
    GARDEN_CARE_TYPES,
    type GardenZone,
    type GardenZoneType,
    type GardenLocation,
    type GardenSunExposure,
    type GardenPlant,
    type GardenPlantType,
    type GardenHealthStatus,
    type GardenCare,
    type GardenCareType,
    type GardenObservation,
    useGardenZones,
    useGardenPlants,
    useGardenCare,
    useGardenObservations,
    useGardenStatistics,
    useCreateZone,
    useUpdateZone,
    useDeleteZone,
    useCreatePlant,
    useUpdatePlant,
    useDeletePlant,
    useCreateCare,
    useUpdateCare,
    useDeleteCare,
    useCompleteCare,
    useCreateObservation,
    useDeleteObservation,
} from '../hooks/useGarden';

// =============================================================================
// /garden — "Jardin & Pelouse" module.
// Five tabs: dashboard, zones, plants, care (entretien), journal (observations).
// Enum values are stored in French; translated only at render via
// t('garden.<map>.' + value).
// =============================================================================

const formatDate = (d: string | null | undefined): string =>
    d ? format(parseISO(d), 'dd MMM yyyy', { locale: getDateFnsLocale() }) : '—';

const today = (): string => new Date().toISOString().slice(0, 10);

const Garden: React.FC = () => {
    const { t } = useTranslation();
    const tabs = [
        { value: 'overview', label: t('garden.tabs.overview'), content: <OverviewTab /> },
        { value: 'zones', label: t('garden.tabs.zones'), content: <ZonesTab /> },
        { value: 'plants', label: t('garden.tabs.plants'), content: <PlantsTab /> },
        { value: 'care', label: t('garden.tabs.care'), content: <CareTab /> },
        { value: 'journal', label: t('garden.tabs.journal'), content: <JournalTab /> },
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div>
                <h1 className="mb-1 text-h1">{t('garden.page.title')}</h1>
                <p className="text-body text-muted-foreground">{t('garden.page.subtitle')}</p>
            </div>
            <Tabs tabs={tabs} />
        </div>
    );
};

// ---------- shared bits ----------

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
    </div>
);

const StatCard: React.FC<{
    label: string;
    value: number;
    icon: React.ReactNode;
    tone?: 'default' | 'warning';
}> = ({ label, value, icon, tone = 'default' }) => (
    <Card hover={false}>
        <CardContent className="flex items-center gap-3 p-4">
            <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-card ${
                    tone === 'warning'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-primary-soft text-primary'
                }`}
            >
                {icon}
            </div>
            <div>
                <p className="text-h2 font-semibold leading-none">{value}</p>
                <p className="mt-1 text-micro text-muted-foreground">{label}</p>
            </div>
        </CardContent>
    </Card>
);

// ---------- Overview tab ----------

const OverviewTab: React.FC = () => {
    const { t } = useTranslation();
    const statsQuery = useGardenStatistics();
    const zonesQuery = useGardenZones();
    const completeMut = useCompleteCare();
    const { showToast } = useToast();
    const [tipsZone, setTipsZone] = useState<GardenZone | null>(null);

    const handleComplete = async (care: GardenCare) => {
        try {
            const result = await completeMut.mutateAsync({ id: care.id });
            showToast({
                title: t('garden.care.completedToast'),
                description: result.next_occurrence?.planned_date
                    ? t('garden.care.nextOccurrence', {
                          date: formatDate(result.next_occurrence.planned_date),
                      })
                    : undefined,
            });
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    if (statsQuery.isPending) {
        return (
            <p className="py-6 text-center text-caption text-muted-foreground">
                {t('garden.common.loading')}
            </p>
        );
    }
    if (statsQuery.isError) {
        return (
            <ErrorBanner
                message={
                    statsQuery.error instanceof Error
                        ? statsQuery.error.message
                        : t('garden.common.error')
                }
            />
        );
    }

    const stats = statsQuery.data!;
    const zones = zonesQuery.data ?? [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard
                    label={t('garden.stats.zones')}
                    value={stats.counts.zones}
                    icon={<Sprout className="h-5 w-5" />}
                />
                <StatCard
                    label={t('garden.stats.plants')}
                    value={stats.counts.plants}
                    icon={<Leaf className="h-5 w-5" />}
                />
                <StatCard
                    label={t('garden.stats.plantsToWatch')}
                    value={stats.counts.plants_to_watch}
                    icon={<Eye className="h-5 w-5" />}
                    tone="warning"
                />
                <StatCard
                    label={t('garden.stats.careDueToday')}
                    value={stats.counts.care_due_today}
                    icon={<Droplets className="h-5 w-5" />}
                    tone={stats.counts.care_due_today > 0 ? 'warning' : 'default'}
                />
                <StatCard
                    label={t('garden.stats.careDue7d')}
                    value={stats.counts.care_due_7d}
                    icon={<CalendarClock className="h-5 w-5" />}
                />
            </div>

            {/* Zones with AI tips access */}
            <section className="space-y-3">
                <h2 className="text-h2 font-semibold">{t('garden.overview.zonesTitle')}</h2>
                {zones.length === 0 ? (
                    <p className="text-caption text-muted-foreground">
                        {t('garden.overview.noZones')}
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {zones.map((z) => (
                            <button
                                key={z.id}
                                type="button"
                                onClick={() => setTipsZone(z)}
                                className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-card px-3 py-1.5 text-caption font-medium text-foreground hover:border-primary/40 hover:bg-surface-2"
                            >
                                <Sprout className="h-3.5 w-3.5 text-success" />
                                {z.name}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Upcoming care */}
            <section className="space-y-3">
                <h2 className="text-h2 font-semibold">{t('garden.overview.upcomingTitle')}</h2>
                {stats.upcoming_care.length === 0 ? (
                    <p className="text-caption text-muted-foreground">
                        {t('garden.overview.noUpcoming')}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {stats.upcoming_care.map((c) => (
                            <CareCard
                                key={c.id}
                                care={c}
                                onComplete={() => handleComplete(c)}
                                onEdit={() => {}}
                                onDelete={() => {}}
                            />
                        ))}
                    </ul>
                )}
            </section>

            {tipsZone && (
                <GardenTipsDialog
                    open={!!tipsZone}
                    onOpenChange={(open) => !open && setTipsZone(null)}
                    zoneId={tipsZone.id}
                    zoneName={tipsZone.name}
                />
            )}
        </div>
    );
};

// ---------- Zones tab ----------

const ZonesTab: React.FC = () => {
    const { t } = useTranslation();
    const [zoneType, setZoneType] = useState<GardenZoneType | 'all'>('all');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const zonesQuery = useGardenZones({
        zone_type: zoneType === 'all' ? undefined : zoneType,
        q: search || undefined,
    });
    const deleteMut = useDeleteZone();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<GardenZone | null>(null);
    const [tipsZone, setTipsZone] = useState<GardenZone | null>(null);

    const onSubmitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearch(searchInput.trim());
    };

    const handleDelete = async (z: GardenZone) => {
        if (!confirm(t('garden.zone.deleteConfirm', { name: z.name }))) return;
        try {
            await deleteMut.mutateAsync(z.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <form
                    onSubmit={onSubmitSearch}
                    className="flex w-full items-center gap-2 md:max-w-md"
                >
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={t('garden.zone.searchPlaceholder')}
                            className="pl-9"
                        />
                    </div>
                </form>
                <Button
                    onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('garden.zone.add')}
                </Button>
            </div>

            <div className="flex flex-wrap gap-2">
                <Chip
                    label={t('garden.common.all')}
                    active={zoneType === 'all'}
                    onClick={() => setZoneType('all')}
                />
                {GARDEN_ZONE_TYPES.map((zt) => (
                    <Chip
                        key={zt}
                        label={t('garden.zoneTypes.' + zt, { defaultValue: zt })}
                        active={zoneType === zt}
                        onClick={() => setZoneType(zt)}
                    />
                ))}
            </div>

            {zonesQuery.isPending ? (
                <p className="py-6 text-center text-caption text-muted-foreground">
                    {t('garden.common.loading')}
                </p>
            ) : zonesQuery.isError ? (
                <ErrorBanner
                    message={
                        zonesQuery.error instanceof Error
                            ? zonesQuery.error.message
                            : t('garden.common.error')
                    }
                />
            ) : zonesQuery.data && zonesQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {zonesQuery.data.map((z) => (
                        <ZoneCard
                            key={z.id}
                            zone={z}
                            onEdit={() => {
                                setEditing(z);
                                setDialogOpen(true);
                            }}
                            onDelete={() => handleDelete(z)}
                            onTips={() => setTipsZone(z)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    title={t('garden.zone.emptyTitle')}
                    description={t('garden.zone.emptyDescription')}
                    actionLabel={t('garden.zone.add')}
                    onAction={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                />
            )}

            <ZoneDialog open={dialogOpen} onOpenChange={setDialogOpen} zone={editing} />
            {tipsZone && (
                <GardenTipsDialog
                    open={!!tipsZone}
                    onOpenChange={(open) => !open && setTipsZone(null)}
                    zoneId={tipsZone.id}
                    zoneName={tipsZone.name}
                />
            )}
        </div>
    );
};

const Chip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
    label,
    active,
    onClick,
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-pill border px-3 py-1.5 text-caption font-medium transition-colors ${
            active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-card text-foreground hover:bg-surface-2'
        }`}
    >
        {label}
    </button>
);

// ---------- Zone dialog ----------

const ZoneDialog: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    zone: GardenZone | null;
}> = ({ open, onOpenChange, zone }) => {
    const { t } = useTranslation();
    const createMut = useCreateZone();
    const updateMut = useUpdateZone();
    const isEdit = !!zone;

    const [name, setName] = useState('');
    const [zoneType, setZoneType] = useState<GardenZoneType>('Pelouse');
    const [location, setLocation] = useState('');
    const [areaM2, setAreaM2] = useState('');
    const [sunExposure, setSunExposure] = useState('');
    const [soilType, setSoilType] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (!open) return;
        setName(zone?.name ?? '');
        setZoneType(zone?.zone_type ?? 'Pelouse');
        setLocation(zone?.location ?? '');
        setAreaM2(zone?.area_m2 != null ? String(zone.area_m2) : '');
        setSunExposure(zone?.sun_exposure ?? '');
        setSoilType(zone?.soil_type ?? '');
        setNotes(zone?.notes ?? '');
    }, [open, zone]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const body = {
            name: name.trim(),
            zone_type: zoneType,
            location: (location || null) as GardenLocation | null,
            area_m2: areaM2 ? Number(areaM2) : null,
            sun_exposure: (sunExposure || null) as GardenSunExposure | null,
            soil_type: soilType.trim() || null,
            notes: notes.trim() || null,
        };
        setSaving(true);
        try {
            if (isEdit) await updateMut.mutateAsync({ id: zone!.id, patch: body });
            else await createMut.mutateAsync(body);
            onOpenChange(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={isEdit ? t('garden.zone.editTitle') : t('garden.zone.add')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label={t('garden.zone.name')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.zone.type')}
                        </label>
                        <Select
                            value={zoneType}
                            onValueChange={(v) => setZoneType(v as GardenZoneType)}
                            options={GARDEN_ZONE_TYPES.map((zt) => ({
                                value: zt,
                                label: t('garden.zoneTypes.' + zt, { defaultValue: zt }),
                            }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.zone.location')}
                        </label>
                        <Select
                            value={location}
                            onValueChange={setLocation}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...GARDEN_LOCATIONS.map((l) => ({
                                    value: l,
                                    label: t('garden.locations.' + l, { defaultValue: l }),
                                })),
                            ]}
                        />
                    </div>
                    <Input
                        label={t('garden.zone.areaLabel')}
                        type="number"
                        min={0}
                        step="0.1"
                        value={areaM2}
                        onChange={(e) => setAreaM2(e.target.value)}
                    />
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.zone.sunExposure')}
                        </label>
                        <Select
                            value={sunExposure}
                            onValueChange={setSunExposure}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...GARDEN_SUN_EXPOSURES.map((s) => ({
                                    value: s,
                                    label: t('garden.sunExposures.' + s, { defaultValue: s }),
                                })),
                            ]}
                        />
                    </div>
                </div>
                <Input
                    label={t('garden.zone.soilType')}
                    value={soilType}
                    onChange={(e) => setSoilType(e.target.value)}
                />
                <Textarea
                    label={t('garden.zone.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('garden.common.cancel')}
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {t('garden.common.save')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

// ---------- Plants tab ----------

const PlantsTab: React.FC = () => {
    const { t } = useTranslation();
    const [plantType, setPlantType] = useState<GardenPlantType | 'all'>('all');
    const [zoneFilter, setZoneFilter] = useState<string>('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const zonesQuery = useGardenZones();
    const plantsQuery = useGardenPlants({
        plant_type: plantType === 'all' ? undefined : plantType,
        zone_id: zoneFilter || undefined,
        q: search || undefined,
    });
    const deleteMut = useDeletePlant();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<GardenPlant | null>(null);

    const onSubmitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearch(searchInput.trim());
    };

    const handleDelete = async (p: GardenPlant) => {
        if (!confirm(t('garden.plant.deleteConfirm', { name: p.name }))) return;
        try {
            await deleteMut.mutateAsync(p.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    const zones = zonesQuery.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <form
                    onSubmit={onSubmitSearch}
                    className="flex w-full items-center gap-2 md:max-w-md"
                >
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={t('garden.plant.searchPlaceholder')}
                            className="pl-9"
                        />
                    </div>
                </form>
                <Button
                    onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('garden.plant.add')}
                </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
                <div className="sm:w-56">
                    <Select
                        value={zoneFilter}
                        onValueChange={setZoneFilter}
                        placeholder={t('garden.plant.allZones')}
                        options={[
                            { value: '', label: t('garden.plant.allZones') },
                            ...zones.map((z) => ({ value: z.id, label: z.name })),
                        ]}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Chip
                        label={t('garden.common.all')}
                        active={plantType === 'all'}
                        onClick={() => setPlantType('all')}
                    />
                    {GARDEN_PLANT_TYPES.map((pt) => (
                        <Chip
                            key={pt}
                            label={t('garden.plantTypes.' + pt, { defaultValue: pt })}
                            active={plantType === pt}
                            onClick={() => setPlantType(pt)}
                        />
                    ))}
                </div>
            </div>

            {plantsQuery.isPending ? (
                <p className="py-6 text-center text-caption text-muted-foreground">
                    {t('garden.common.loading')}
                </p>
            ) : plantsQuery.isError ? (
                <ErrorBanner
                    message={
                        plantsQuery.error instanceof Error
                            ? plantsQuery.error.message
                            : t('garden.common.error')
                    }
                />
            ) : plantsQuery.data && plantsQuery.data.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {plantsQuery.data.map((p) => (
                        <PlantCard
                            key={p.id}
                            plant={p}
                            onEdit={() => {
                                setEditing(p);
                                setDialogOpen(true);
                            }}
                            onDelete={() => handleDelete(p)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    title={t('garden.plant.emptyTitle')}
                    description={t('garden.plant.emptyDescription')}
                    actionLabel={t('garden.plant.add')}
                    onAction={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                />
            )}

            <PlantDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                plant={editing}
                zones={zones}
            />
        </div>
    );
};

// ---------- Plant dialog ----------

const PlantDialog: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    plant: GardenPlant | null;
    zones: GardenZone[];
}> = ({ open, onOpenChange, plant, zones }) => {
    const { t } = useTranslation();
    const createMut = useCreatePlant();
    const updateMut = useUpdatePlant();
    const isEdit = !!plant;

    const [name, setName] = useState('');
    const [plantType, setPlantType] = useState<GardenPlantType>('Légume');
    const [zoneId, setZoneId] = useState('');
    const [variety, setVariety] = useState('');
    const [plantedDate, setPlantedDate] = useState('');
    const [wateringDays, setWateringDays] = useState('');
    const [healthStatus, setHealthStatus] = useState<GardenHealthStatus>('En bonne santé');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (!open) return;
        setName(plant?.name ?? '');
        setPlantType(plant?.plant_type ?? 'Légume');
        setZoneId(plant?.zone_id ?? '');
        setVariety(plant?.variety ?? '');
        setPlantedDate(plant?.planted_date ?? '');
        setWateringDays(
            plant?.watering_frequency_days != null ? String(plant.watering_frequency_days) : '',
        );
        setHealthStatus(plant?.health_status ?? 'En bonne santé');
        setNotes(plant?.notes ?? '');
    }, [open, plant]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const body = {
            name: name.trim(),
            plant_type: plantType,
            zone_id: zoneId || null,
            variety: variety.trim() || null,
            planted_date: plantedDate || null,
            watering_frequency_days: wateringDays ? Number(wateringDays) : null,
            health_status: healthStatus,
            notes: notes.trim() || null,
        };
        setSaving(true);
        try {
            if (isEdit) await updateMut.mutateAsync({ id: plant!.id, patch: body });
            else await createMut.mutateAsync(body);
            onOpenChange(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={isEdit ? t('garden.plant.editTitle') : t('garden.plant.add')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label={t('garden.plant.name')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.plant.type')}
                        </label>
                        <Select
                            value={plantType}
                            onValueChange={(v) => setPlantType(v as GardenPlantType)}
                            options={GARDEN_PLANT_TYPES.map((pt) => ({
                                value: pt,
                                label: t('garden.plantTypes.' + pt, { defaultValue: pt }),
                            }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.plant.zone')}
                        </label>
                        <Select
                            value={zoneId}
                            onValueChange={setZoneId}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...zones.map((z) => ({ value: z.id, label: z.name })),
                            ]}
                        />
                    </div>
                    <Input
                        label={t('garden.plant.variety')}
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                    />
                    <DatePicker
                        label={t('garden.plant.plantedDate')}
                        value={plantedDate}
                        onChange={setPlantedDate}
                    />
                    <Input
                        label={t('garden.plant.wateringFrequency')}
                        type="number"
                        min={0}
                        value={wateringDays}
                        onChange={(e) => setWateringDays(e.target.value)}
                    />
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.plant.healthStatus')}
                        </label>
                        <Select
                            value={healthStatus}
                            onValueChange={(v) => setHealthStatus(v as GardenHealthStatus)}
                            options={GARDEN_HEALTH_STATUSES.map((h) => ({
                                value: h,
                                label: t('garden.healthStatuses.' + h, { defaultValue: h }),
                            }))}
                        />
                    </div>
                </div>
                <Textarea
                    label={t('garden.plant.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('garden.common.cancel')}
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {t('garden.common.save')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

// ---------- Care (entretien) tab ----------

const CareTab: React.FC = () => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [status, setStatus] = useState<'upcoming' | 'done' | 'all'>('upcoming');
    const careQuery = useGardenCare({ status });
    const zonesQuery = useGardenZones();
    const plantsQuery = useGardenPlants();
    const completeMut = useCompleteCare();
    const deleteMut = useDeleteCare();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<GardenCare | null>(null);

    const handleComplete = async (care: GardenCare) => {
        try {
            const result = await completeMut.mutateAsync({ id: care.id });
            showToast({
                title: t('garden.care.completedToast'),
                description: result.next_occurrence?.planned_date
                    ? t('garden.care.nextOccurrence', {
                          date: formatDate(result.next_occurrence.planned_date),
                      })
                    : undefined,
            });
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    const handleDelete = async (care: GardenCare) => {
        if (!confirm(t('garden.care.deleteConfirm', { title: care.title }))) return;
        try {
            await deleteMut.mutateAsync(care.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                    {(['upcoming', 'done', 'all'] as const).map((s) => (
                        <Chip
                            key={s}
                            label={t('garden.care.filter.' + s)}
                            active={status === s}
                            onClick={() => setStatus(s)}
                        />
                    ))}
                </div>
                <Button
                    onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('garden.care.add')}
                </Button>
            </div>

            {careQuery.isPending ? (
                <p className="py-6 text-center text-caption text-muted-foreground">
                    {t('garden.common.loading')}
                </p>
            ) : careQuery.isError ? (
                <ErrorBanner
                    message={
                        careQuery.error instanceof Error
                            ? careQuery.error.message
                            : t('garden.common.error')
                    }
                />
            ) : careQuery.data && careQuery.data.length > 0 ? (
                <ul className="space-y-2">
                    {careQuery.data.map((c) => (
                        <CareCard
                            key={c.id}
                            care={c}
                            onComplete={() => handleComplete(c)}
                            onEdit={() => {
                                setEditing(c);
                                setDialogOpen(true);
                            }}
                            onDelete={() => handleDelete(c)}
                        />
                    ))}
                </ul>
            ) : (
                <EmptyState
                    title={t('garden.care.emptyTitle')}
                    description={t('garden.care.emptyDescription')}
                    actionLabel={t('garden.care.add')}
                    onAction={() => {
                        setEditing(null);
                        setDialogOpen(true);
                    }}
                />
            )}

            <CareDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                care={editing}
                zones={zonesQuery.data ?? []}
                plants={plantsQuery.data ?? []}
            />
        </div>
    );
};

// ---------- Care dialog ----------

const CareDialog: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    care: GardenCare | null;
    zones: GardenZone[];
    plants: GardenPlant[];
}> = ({ open, onOpenChange, care, zones, plants }) => {
    const { t } = useTranslation();
    const createMut = useCreateCare();
    const updateMut = useUpdateCare();
    const isEdit = !!care;

    const [title, setTitle] = useState('');
    const [careType, setCareType] = useState<GardenCareType>('Arrosage');
    const [zoneId, setZoneId] = useState('');
    const [plantId, setPlantId] = useState('');
    const [plannedDate, setPlannedDate] = useState('');
    const [performedDate, setPerformedDate] = useState('');
    const [cost, setCost] = useState('');
    const [recurrenceDays, setRecurrenceDays] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (!open) return;
        setTitle(care?.title ?? '');
        setCareType(care?.care_type ?? 'Arrosage');
        setZoneId(care?.zone_id ?? '');
        setPlantId(care?.plant_id ?? '');
        setPlannedDate(care?.planned_date ?? (isEdit ? '' : today()));
        setPerformedDate(care?.performed_date ?? '');
        setCost(care?.cost != null ? String(care.cost) : '');
        setRecurrenceDays(care?.recurrence_days != null ? String(care.recurrence_days) : '');
        setNotes(care?.notes ?? '');
        setError('');
    }, [open, care, isEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        if (!plannedDate && !performedDate) {
            setError(t('garden.care.dateRequired'));
            return;
        }
        const body = {
            title: title.trim(),
            care_type: careType,
            zone_id: zoneId || null,
            plant_id: plantId || null,
            planned_date: plannedDate || null,
            performed_date: performedDate || null,
            cost: cost ? Number(cost) : null,
            recurrence_days: recurrenceDays ? Number(recurrenceDays) : null,
            notes: notes.trim() || null,
        };
        setSaving(true);
        try {
            if (isEdit) await updateMut.mutateAsync({ id: care!.id, patch: body });
            else await createMut.mutateAsync(body);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('garden.common.genericError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={isEdit ? t('garden.care.editTitle') : t('garden.care.add')}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label={t('garden.care.title')}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.care.type')}
                        </label>
                        <Select
                            value={careType}
                            onValueChange={(v) => setCareType(v as GardenCareType)}
                            options={GARDEN_CARE_TYPES.map((ct) => ({
                                value: ct,
                                label: t('garden.careTypes.' + ct, { defaultValue: ct }),
                            }))}
                        />
                    </div>
                    <Input
                        label={t('garden.care.cost')}
                        type="number"
                        min={0}
                        step="0.01"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                    />
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.care.zone')}
                        </label>
                        <Select
                            value={zoneId}
                            onValueChange={setZoneId}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...zones.map((z) => ({ value: z.id, label: z.name })),
                            ]}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.care.plant')}
                        </label>
                        <Select
                            value={plantId}
                            onValueChange={setPlantId}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...plants.map((p) => ({ value: p.id, label: p.name })),
                            ]}
                        />
                    </div>
                    <DatePicker
                        label={t('garden.care.plannedDate')}
                        value={plannedDate}
                        onChange={setPlannedDate}
                    />
                    <DatePicker
                        label={t('garden.care.performedDate')}
                        value={performedDate}
                        onChange={setPerformedDate}
                    />
                    <Input
                        label={t('garden.care.recurrence')}
                        type="number"
                        min={0}
                        value={recurrenceDays}
                        onChange={(e) => setRecurrenceDays(e.target.value)}
                    />
                </div>
                <Textarea
                    label={t('garden.care.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                {error && <p className="text-micro text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('garden.common.cancel')}
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {t('garden.common.save')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

// ---------- Journal (observations) tab ----------

const JournalTab: React.FC = () => {
    const { t } = useTranslation();
    const observationsQuery = useGardenObservations();
    const zonesQuery = useGardenZones();
    const plantsQuery = useGardenPlants();
    const deleteMut = useDeleteObservation();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleDelete = async (o: GardenObservation) => {
        if (!confirm(t('garden.journal.deleteConfirm'))) return;
        try {
            await deleteMut.mutateAsync(o.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('garden.common.genericError'));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-caption text-muted-foreground">{t('garden.journal.intro')}</p>
                <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('garden.journal.add')}
                </Button>
            </div>

            {observationsQuery.isPending ? (
                <p className="py-6 text-center text-caption text-muted-foreground">
                    {t('garden.common.loading')}
                </p>
            ) : observationsQuery.isError ? (
                <ErrorBanner
                    message={
                        observationsQuery.error instanceof Error
                            ? observationsQuery.error.message
                            : t('garden.common.error')
                    }
                />
            ) : observationsQuery.data && observationsQuery.data.length > 0 ? (
                <ul className="space-y-2">
                    {observationsQuery.data.map((o) => (
                        <ObservationRow
                            key={o.id}
                            observation={o}
                            onDelete={() => handleDelete(o)}
                        />
                    ))}
                </ul>
            ) : (
                <EmptyState
                    title={t('garden.journal.emptyTitle')}
                    description={t('garden.journal.emptyDescription')}
                    actionLabel={t('garden.journal.add')}
                    onAction={() => setDialogOpen(true)}
                />
            )}

            <ObservationDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                zones={zonesQuery.data ?? []}
                plants={plantsQuery.data ?? []}
            />
        </div>
    );
};

const HEALTH_VARIANT: Record<GardenHealthStatus, 'success' | 'warning' | 'danger' | 'secondary'> = {
    'En bonne santé': 'success',
    'À surveiller': 'warning',
    Malade: 'danger',
    Mort: 'secondary',
};

const ObservationRow: React.FC<{
    observation: GardenObservation;
    onDelete: () => void;
}> = ({ observation, onDelete }) => {
    const { t } = useTranslation();
    return (
        <li className="rounded-card border border-border bg-card p-3">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Eye className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-caption font-semibold">
                            {formatDate(observation.observed_at)}
                        </span>
                        {(observation.plant_name || observation.zone_name) && (
                            <span className="text-micro text-muted-foreground">
                                · {observation.plant_name ?? observation.zone_name}
                            </span>
                        )}
                    </div>
                    {observation.notes && (
                        <p className="mt-1 text-micro text-foreground">{observation.notes}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-muted-foreground">
                        {observation.health_status && (
                            <span
                                className={`inline-flex items-center rounded-pill border px-2 py-0.5 ${
                                    HEALTH_VARIANT[observation.health_status] === 'success'
                                        ? 'border-success/20 bg-success/10 text-success'
                                        : HEALTH_VARIANT[observation.health_status] === 'warning'
                                          ? 'border-warning/20 bg-warning/10 text-warning'
                                          : HEALTH_VARIANT[observation.health_status] === 'danger'
                                            ? 'border-danger/20 bg-danger/10 text-danger'
                                            : 'border-border bg-muted text-muted-foreground'
                                }`}
                            >
                                {t('garden.healthStatuses.' + observation.health_status, {
                                    defaultValue: observation.health_status,
                                })}
                            </span>
                        )}
                        {observation.height_cm != null && (
                            <span>
                                {t('garden.journal.height', { height: observation.height_cm })}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={onDelete}
                    className="rounded p-1 hover:bg-destructive/10"
                    aria-label={t('garden.common.delete')}
                >
                    <Trash2 className="h-4 w-4 text-destructive" />
                </button>
            </div>
        </li>
    );
};

const ObservationDialog: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    zones: GardenZone[];
    plants: GardenPlant[];
}> = ({ open, onOpenChange, zones, plants }) => {
    const { t } = useTranslation();
    const createMut = useCreateObservation();

    const [zoneId, setZoneId] = useState('');
    const [plantId, setPlantId] = useState('');
    const [observedAt, setObservedAt] = useState('');
    const [healthStatus, setHealthStatus] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (!open) return;
        setZoneId('');
        setPlantId('');
        setObservedAt(today());
        setHealthStatus('');
        setHeightCm('');
        setNotes('');
        setError('');
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!zoneId && !plantId) {
            setError(t('garden.journal.targetRequired'));
            return;
        }
        const body = {
            zone_id: zoneId || null,
            plant_id: plantId || null,
            observed_at: observedAt || null,
            health_status: (healthStatus || null) as GardenHealthStatus | null,
            height_cm: heightCm ? Number(heightCm) : null,
            notes: notes.trim() || null,
        };
        setSaving(true);
        try {
            await createMut.mutateAsync(body);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('garden.common.genericError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange} title={t('garden.journal.add')}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.journal.zone')}
                        </label>
                        <Select
                            value={zoneId}
                            onValueChange={setZoneId}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...zones.map((z) => ({ value: z.id, label: z.name })),
                            ]}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.journal.plant')}
                        </label>
                        <Select
                            value={plantId}
                            onValueChange={setPlantId}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...plants.map((p) => ({ value: p.id, label: p.name })),
                            ]}
                        />
                    </div>
                    <DatePicker
                        label={t('garden.journal.observedAt')}
                        value={observedAt}
                        onChange={setObservedAt}
                    />
                    <div>
                        <label className="mb-1.5 block text-caption font-medium text-foreground">
                            {t('garden.journal.healthStatus')}
                        </label>
                        <Select
                            value={healthStatus}
                            onValueChange={setHealthStatus}
                            placeholder={t('garden.common.none')}
                            options={[
                                { value: '', label: t('garden.common.none') },
                                ...GARDEN_HEALTH_STATUSES.map((h) => ({
                                    value: h,
                                    label: t('garden.healthStatuses.' + h, { defaultValue: h }),
                                })),
                            ]}
                        />
                    </div>
                    <Input
                        label={t('garden.journal.heightLabel')}
                        type="number"
                        min={0}
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                    />
                </div>
                <Textarea
                    label={t('garden.journal.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                {error && <p className="text-micro text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('garden.common.cancel')}
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {t('garden.common.save')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

export default Garden;
