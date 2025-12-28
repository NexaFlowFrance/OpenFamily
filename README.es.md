# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)

**Aplicación 100% local y de código abierto para gestión familiar**

[🇫🇷 Français](README.md) | [🇬🇧 English](README.en.md) | [🇩🇪 Deutsch](README.de.md) | 🇪🇸 Español

[Características](#-características) •
[Instalación](#-instalación) •
[Documentación](#-documentación) •
[Contribuir](#-contribuir) •
[Licencia](#-licencia)

</div>

---

## 🎯 Acerca de

OpenFamily es una aplicación completa de gestión familiar ofrecida como código abierto por [NexaFlow](http://nexaflow.fr), diseñada para ser auto-alojada. Mantenga el control total de sus datos alojando la aplicación en su propio servidor. Gestione sus listas de compras, tareas, citas, recetas, planificación de comidas y presupuesto familiar de forma segura, accesible desde todos sus dispositivos.

**Versión 1.0.3 - Arquitectura solo servidor**  
Esta versión elimina completamente el modo localStorage en favor de una arquitectura de servidor centralizada con PostgreSQL, garantizando una sincronización confiable entre todos los dispositivos de la familia.

## 🚀 Características principales

- ✅ **100% Auto-alojado** - Sus datos en su propio servidor, sin servicios de terceros
- 📱 **PWA** - Instale la aplicación como una aplicación nativa en móvil/tablet
- 🔒 **Privado** - Sus datos permanecen en su servidor, nunca en servidores de terceros
- 🔄 **Sincronizado** - Acceda a sus datos desde todos sus dispositivos
- 🆓 **Código Abierto** - Código fuente libre y modificable
- 🌍 **Multi-idioma** - Interfaz disponible en francés, inglés, alemán y español
- 🌙 **Tema oscuro** - Modos claro y oscuro disponibles
- 💡 **Lista inteligente** - Sugerencias de ingredientes basadas en sus comidas planificadas
- 👨‍👩‍👧‍👦 **Multi-usuario** - Gestione toda la familia con información de salud

## 📋 Funcionalidades

### 🛒 Lista de compras
- Categorización automática (Bebé, Alimentación, Hogar, Salud, Otro)
- Precios y cantidades
- Sugerencias inteligentes basadas en recetas planificadas
- **📋 Plantillas de listas** - Guarde y reutilice sus listas recurrentes
- **📱 Escaneo de códigos de barras** - Agregue artículos escaneando (solo móvil)

### ✅ Tareas y listas
- Tareas recurrentes (diarias, semanales, mensuales, anuales)
- Asignación a miembros de la familia
- Notas y prioridades
- Vista de calendario integrada
- **📊 Historial y estadísticas** - Tasa de finalización, tendencias semanales

### 📅 Citas
- Calendario mensual con vista francesa
- Integración de tareas y citas
- Recordatorios y notas
- Código de color por miembro de la familia
- **🔔 Notificaciones automáticas** - Recordatorios 30 min y 1h antes de cada cita

### 🍳 Recetas
- Biblioteca de recetas familiares
- Categorías (Entrada, Plato principal, Postre, Merienda)
- Tiempo de preparación y cocción
- Porciones y etiquetas
- **🔍 Filtros avanzados** - Por categoría, tiempo de preparación, dificultad

### 🍽️ Planificación de comidas
- Vista semanal (Lunes-Domingo)
- 4 tipos de comidas por día (Desayuno, Almuerzo, Cena, Merienda)
- Enlace automático con recetas
- Exportación de planificación
- **📄 Exportación PDF** - Imprima su plan de comidas semanal

### 💰 Presupuesto familiar
- Seguimiento mensual de gastos
- 6 categorías: Alimentación, Salud, Niños, Hogar, Ocio, Otro
- Definición de presupuestos por categoría
- Gráficos de progreso
- Alertas de exceso
- **📊 Estadísticas avanzadas** - Tendencias de 6 meses, desglose por categoría

### 👨‍👩‍👧‍👦 Gestión familiar
- Perfiles para cada miembro
- Información de salud (grupo sanguíneo, alergias, vacunas)
- Contacto de emergencia
- Notas médicas
- Código de color personalizado

---

## ✨ Funcionalidades avanzadas

### 🔔 Notificaciones inteligentes
- Recordatorios automáticos 30 minutos y 1 hora antes de cada cita
- Recordatorios 15 minutos antes y a la hora exacta para tareas con fecha límite
- Soporte de notificaciones del navegador (permiso requerido)

### 🔍 Búsqueda global
- Búsqueda instantánea en todos sus datos (Ctrl/Cmd+K)
- Resultados agrupados por categoría: compras, tareas, citas, recetas, comidas
- Navegación rápida a cualquier página

### 🚀 Acciones rápidas
- Widgets en la página de inicio para crear rápidamente tareas y artículos
- Formularios en línea con soporte de teclado (tecla Enter)
- Acceso directo a las funciones principales

### 🌙 Tema automático
- Modo claro, oscuro o automático
- Detección automática de preferencias del sistema
- Cambio entre 3 modos con un solo clic

### 💾 Importar/Exportar datos
- Exportación JSON completa con versionado
- Importación de copia de seguridad con confirmación
- Copia de seguridad manual o automática de todos sus datos

## 🚀 Inicio rápido

### Modo Local (Sin servidor)

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
pnpm install
pnpm dev
# Abra http://localhost:3000
```

### Modo Servidor (Auto-alojado con Docker)

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
cp .env.example .env
# Modifique DB_PASSWORD en .env
docker-compose up -d
```

Ver [DEPLOYMENT.md](docs/DEPLOYMENT.md) para más detalles.

## 💾 Almacenamiento de datos

### 📱 Modo Local
- ✅ 100% privado - Los datos nunca salen de su dispositivo
- ✅ Funciona sin conexión
- ⚠️ Sin sincronización

### 🔄 Modo Servidor
- ✅ Sincronización familiar
- ✅ Acceso multi-dispositivo
- ✅ Control total

## 🛠️ Tecnologías

- **Frontend**: React 19 + TypeScript + Vite 7 + TailwindCSS
- **Backend**: Node.js 20+ + Express + PostgreSQL 16
- **Móvil**: Capacitor + PWA

## 🔐 Privacidad

**Modo Local**: No se envían datos a servidores externos.

**Modo Servidor**: Usted controla la infraestructura en su propio servidor.

## ❓ Preguntas frecuentes

### ¿Son seguros mis datos?
**Modo Local**: Sí, todos los datos se almacenan localmente en su navegador.
**Modo Servidor**: Sí, en su propio servidor con control total.

### ¿Está disponible la aplicación en varios idiomas?
Sí! Disponible en **Francés 🇫🇷**, **Inglés 🇬🇧**, **Alemán 🇩🇪** y **Español 🇪🇸**.

### ¿Puedo sincronizar entre varios dispositivos?
**Modo Local**: Use exportar/importar para transferencia manual.
**Modo Servidor**: ¡Sí! Sincronización automática entre todos los dispositivos.

## 📄 Licencia

AGPL-3.0 con cláusula no comercial. Ver [LICENSE](LICENSE) para detalles.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## 📚 Documentación

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitectura técnica
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Guía de implementación del servidor
- [CONTRIBUTING.md](CONTRIBUTING.md) - Guía de contribución
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Código de conducta
- [CHANGELOG.md](CHANGELOG.md) - Historial de versiones

---

<div align="center">

Hecho con ❤️ por [NexaFlow](https://github.com/NexaFlowFrance)

[⬆ Volver arriba](#openfamily)

</div>
