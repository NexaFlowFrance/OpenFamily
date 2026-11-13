import type { Language } from './languages';

// The words of the display page (lib/displayPage.ts), in the app's languages.
// They are the client's own wording (kiosk, navigation and meal names), copied
// here because the server image does not carry the client's translation files.
// No emoji: an e-paper setup rarely has a font for them.

export interface DisplayStrings {
    today: string;
    tomorrow: string;
    meals: string;
    planning: string;
    tasks: string;
    shopping: string;
    notes: string;
    allDay: string;
    /** "{time}" is replaced by a clock time. */
    until: string;
    /** "{n}" is replaced by a count. */
    more: string;
    /** "{time}" is replaced by a clock time. */
    updated: string;
    emptySchedule: string;
    emptyMeals: string;
    emptyPlanning: string;
    emptyTasks: string;
    emptyShopping: string;
    /** Meal slots are stored under their French names. */
    mealTypes: Record<string, string>;
}

export const DISPLAY_STRINGS: Record<Language, DisplayStrings> = {
    fr: {
        today: 'Aujourd\'hui',
        tomorrow: 'Demain',
        meals: 'Repas',
        planning: 'Qui est où aujourd\'hui',
        tasks: 'Tâches',
        shopping: 'Courses',
        notes: 'Mots de la famille',
        allDay: 'Toute la journée',
        until: 'jusqu\'à {time}',
        more: '+{n} de plus',
        updated: 'Mis à jour à {time}',
        emptySchedule: 'Rien de prévu aujourd\'hui',
        emptyMeals: 'Aucun repas prévu',
        emptyPlanning: 'Personne de prévu aujourd\'hui',
        emptyTasks: 'Tout est fait',
        emptyShopping: 'Rien à acheter',
        mealTypes: { 'Petit-déjeuner': 'Petit-déjeuner', 'Déjeuner': 'Déjeuner', 'Dîner': 'Dîner', 'Snack': 'Snack' },
    },
    en: {
        today: 'Today',
        tomorrow: 'Tomorrow',
        meals: 'Meals',
        planning: 'Who\'s where today',
        tasks: 'Tasks',
        shopping: 'Shopping',
        notes: 'Family notes',
        allDay: 'All day',
        until: 'until {time}',
        more: '+{n} more',
        updated: 'Updated {time}',
        emptySchedule: 'Nothing planned today',
        emptyMeals: 'No meals planned',
        emptyPlanning: 'Nobody scheduled today',
        emptyTasks: 'All caught up',
        emptyShopping: 'Nothing to buy',
        mealTypes: { 'Petit-déjeuner': 'Breakfast', 'Déjeuner': 'Lunch', 'Dîner': 'Dinner', 'Snack': 'Snack' },
    },
    pt: {
        today: 'Hoje',
        tomorrow: 'Amanhã',
        meals: 'Refeições',
        planning: 'Quem está onde hoje',
        tasks: 'Tarefas',
        shopping: 'Compras',
        notes: 'Notas da família',
        allDay: 'Dia inteiro',
        until: 'até {time}',
        more: '+{n} a mais',
        updated: 'Atualizado às {time}',
        emptySchedule: 'Nada planejado para hoje',
        emptyMeals: 'Nenhuma refeição planejada',
        emptyPlanning: 'Ninguém agendado hoje',
        emptyTasks: 'Tudo em dia',
        emptyShopping: 'Nada para comprar',
        mealTypes: { 'Petit-déjeuner': 'Café da Manhã', 'Déjeuner': 'Almoço', 'Dîner': 'Jantar', 'Snack': 'Lanche' },
    },
    ru: {
        today: 'Сегодня',
        tomorrow: 'Завтра',
        meals: 'Питание',
        planning: 'Кто где сегодня',
        tasks: 'Задачи',
        shopping: 'Покупки',
        notes: 'Семейные заметки',
        allDay: 'Весь день',
        until: 'до {time}',
        more: 'ещё {n}',
        updated: 'Обновлено в {time}',
        emptySchedule: 'На сегодня ничего не запланировано',
        emptyMeals: 'Еда не запланирована',
        emptyPlanning: 'На сегодня ни у кого нет расписания',
        emptyTasks: 'Все задачи выполнены',
        emptyShopping: 'Покупать ничего не нужно',
        mealTypes: { 'Petit-déjeuner': 'Завтрак', 'Déjeuner': 'Обед', 'Dîner': 'Ужин', 'Snack': 'Перекус' },
    },
    es: {
        today: 'Hoy',
        tomorrow: 'Mañana',
        meals: 'Comidas',
        planning: 'Dónde está cada uno hoy',
        tasks: 'Tareas',
        shopping: 'Compras',
        notes: 'Notas familiares',
        allDay: 'Todo el día',
        until: 'hasta {time}',
        more: '+{n} más',
        updated: 'Actualizado a las {time}',
        emptySchedule: 'Nada planificado hoy',
        emptyMeals: 'No hay comidas planificadas',
        emptyPlanning: 'Nadie tiene horario hoy',
        emptyTasks: 'Todo al día',
        emptyShopping: 'Nada por comprar',
        mealTypes: { 'Petit-déjeuner': 'Desayuno', 'Déjeuner': 'Almuerzo', 'Dîner': 'Cena', 'Snack': 'Tentempié' },
    },
    ca: {
        today: 'Avui',
        tomorrow: 'Demà',
        meals: 'Àpats',
        planning: 'Qui és on avui',
        tasks: 'Tasques',
        shopping: 'Compres',
        notes: 'Notes familiars',
        allDay: 'Tot el dia',
        until: 'fins a les {time}',
        more: '+{n} més',
        updated: 'Actualitzat a les {time}',
        emptySchedule: 'Res previst per avui',
        emptyMeals: 'No hi ha àpats previstos',
        emptyPlanning: 'Ningú no té horari avui',
        emptyTasks: 'Tot al dia',
        emptyShopping: 'No hi ha res per comprar',
        mealTypes: { 'Petit-déjeuner': 'Esmorzar', 'Déjeuner': 'Dinar', 'Dîner': 'Sopar', 'Snack': 'Refrigeri' },
    },
    zh: {
        today: '今天',
        tomorrow: '明天',
        meals: '餐食',
        planning: '今日家庭成员去向',
        tasks: '任务',
        shopping: '购物',
        notes: '家庭便签',
        allDay: '全天',
        until: '至 {time}',
        more: '还有 {n} 项',
        updated: '更新于 {time}',
        emptySchedule: '今天暂无安排',
        emptyMeals: '暂无餐食安排',
        emptyPlanning: '今天没有成员行程',
        emptyTasks: '所有任务都完成了',
        emptyShopping: '没有待购商品',
        mealTypes: { 'Petit-déjeuner': '早餐', 'Déjeuner': '午餐', 'Dîner': '晚餐', 'Snack': '加餐' },
    },
    de: {
        today: 'Heute',
        tomorrow: 'Morgen',
        meals: 'Mahlzeiten',
        planning: 'Wer ist heute wo',
        tasks: 'Aufgaben',
        shopping: 'Einkaufen',
        notes: 'Familiennotizen',
        allDay: 'Ganztägig',
        until: 'bis {time}',
        more: '+{n} weitere',
        updated: 'Aktualisiert um {time}',
        emptySchedule: 'Heute nichts geplant',
        emptyMeals: 'Keine Mahlzeiten geplant',
        emptyPlanning: 'Heute niemand eingeplant',
        emptyTasks: 'Alles erledigt',
        emptyShopping: 'Nichts zu kaufen',
        mealTypes: { 'Petit-déjeuner': 'Frühstück', 'Déjeuner': 'Mittagessen', 'Dîner': 'Abendessen', 'Snack': 'Snack' },
    },
};
