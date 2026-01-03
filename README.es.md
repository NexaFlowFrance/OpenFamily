# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

**Aplicación 100% local y de código abierto para gestionar la vida familiar**

[🇫🇷 Français](README.md) | [🇬🇧 English](README.en.md) | [🇩🇪 Deutsch](README.de.md) | 🇪🇸 Español

[Funcionalidades](#-funcionalidades) •
[Instalación](#-instalación) •
[Documentación](#-documentación) •
[Contribuir](#-contribuir) •
[Licencia](#-licencia)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-nexaflow%2Fopenfamily-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/nexaflow/openfamily)
[![GitHub](https://img.shields.io/badge/GitHub-NexaFlowFrance%2FOpenFamily-181717?logo=github&logoColor=white)](https://github.com/NexaFlowFrance/OpenFamily)

</div>

---

## 📖 Tabla de contenidos

- [Acerca de](#-acerca-de)
- [Características](#-características)
- [Funcionalidades](#-funcionalidades)
- [Inicio rápido](#-inicio-rápido)
- [Instalación](#-instalación)
- [Almacenamiento de datos](#-almacenamiento-de-datos)
- [Funcionalidades avanzadas](#-funcionalidades-avanzadas)
- [Tecnologías](#️-tecnologías)
- [Compatibilidad](#-compatibilidad)
- [Privacidad](#-privacidad)
- [Preguntas frecuentes](#-preguntas-frecuentes)
- [Licencia](#-licencia)
- [Contribuir](#-contribuir)

---

## 🎯 Acerca de

OpenFamily es una aplicación completa de gestión familiar ofrecida como código abierto por [NexaFlow](http://nexaflow.fr), diseñada para ser auto-alojada. Mantenga el control total de sus datos alojando la aplicación en su propio servidor. Gestione sus compras, tareas, citas, recetas, planificación de comidas y presupuesto familiar de forma segura, accesible desde todos sus dispositivos.


## 🚀 Características

- ✅ **100% Auto-alojado** - Sus datos en su propio servidor, ningún servicio de terceros
- 📱 **PWA** - Instale la aplicación como una aplicación nativa en móvil/tablet
- 🔒 **Privado** - Sus datos permanecen en su servidor, nunca en servidores de terceros
- 🔄 **Sincronizado** - Acceda a sus datos desde todos sus dispositivos
- 🆓 **Código Abierto** - Código fuente libre y modificable
- 🌍 **Multi-idioma** - Interfaz disponible en Francés, Inglés, Alemán y Español
- 🌙 **Tema oscuro** - Modos claro y oscuro disponibles
- 💡 **Lista inteligente** - Sugerencias de ingredientes basadas en sus comidas planificadas
- 👨‍👩‍👧‍👦 **Multi-usuarios** - Gestión de toda la familia con información de salud

## 📋 Funcionalidades

### 🛒 Lista de compras
- Categorización automática (Bebé, Alimentación, Hogar, Salud, Otro)
- Precios y cantidades
- Sugerencias inteligentes basadas en recetas planificadas
- **📋 Plantillas de listas** - Guarde y reutilice sus listas recurrentes

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
- **🔔 Notificaciones automáticas** - Recordatorios 30min y 1h antes de cada cita

### 🍳 Recetas
- Biblioteca de recetas familiares
- Categorías (Entrada, Plato principal, Postre, Snack)
- Tiempo de preparación y cocción
- Porciones y etiquetas
- **🔍 Filtros avanzados** - Por categoría, tiempo de preparación, dificultad

### 🍽️ Planificación de comidas
- Vista semanal (Lunes-Domingo)
- 4 tipos de comidas por día (Desayuno, Almuerzo, Cena, Snack)
- Enlace automático con recetas
- **📄 Exportación PDF** - Imprima su planificación semanal

### 💰 Presupuesto familiar
- Seguimiento mensual de gastos
- 6 categorías: Alimentación, Salud, Niños, Hogar, Ocio, Otro
- Definición de presupuestos por categoría
- Gráficos de progreso
- Alertas de exceso
- **📊 Estadísticas avanzadas** - Evolución de 6 meses, desglose por categoría

### 👨‍👩‍👧‍👦 Gestión familiar
- Perfiles para cada miembro
- Información de salud (grupo sanguíneo, alergias, vacunas)
- Contacto de emergencia
- Notas médicas
- Código de color personalizado

---

## 🚀 Inicio rápido

### Opción 1 : Docker (Recomendado) ⭐

¡El método más simple! Use nuestra imagen Docker preconfigurada:

```bash
# 1. Descargue los archivos de configuración
mkdir openfamily && cd openfamily
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example
cp .env.example .env

# 2. Modifique la contraseña (opcional)
nano .env  # Cambie DB_PASSWORD

# 3. Inicie OpenFamily
docker compose up -d

# 4. Acceda a la aplicación
# http://localhost:3000
```

**¡Eso es todo!** 🎉 La aplicación y la base de datos se configuran automáticamente.

### Opción 2 : Instalación manual

Para desarrolladores o si no puede usar Docker:

```bash
# 1. Clonar el repositorio
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# 2. Instalar PostgreSQL (si no está instalado)
# Windows: https://www.postgresql.org/download/windows/
# Linux: sudo apt install postgresql
# macOS: brew install postgresql

# 3. Crear la base de datos
psql -U postgres
CREATE DATABASE openfamily;
\q

# 4. Configurar el entorno
cp .env.example .env
nano .env  # Ajuste DATABASE_URL con sus credenciales

# 5. Instalar y ejecutar
pnpm install
pnpm build
pnpm start
```

---

## 📦 Instalación

### Requisitos previos

#### Con Docker (Recomendado)
- **Docker Desktop** (Windows/Mac) o **Docker Engine** (Linux)
- **2 GB de RAM mínimo**
- **5 GB de espacio en disco**

#### Sin Docker
- **Node.js 20+** y **pnpm**
- **PostgreSQL 14+**
- **2 GB de RAM mínimo**
- **10 GB de espacio en disco**

### Instalación detallada

📖 **Guía completa** : [FIRST_INSTALLATION.md](FIRST_INSTALLATION.md)

La imagen Docker oficial está disponible en Docker Hub: [nexaflow/openfamily](https://hub.docker.com/r/nexaflow/openfamily)

### Configuración de red

#### Acceso solo local
La aplicación funciona inmediatamente en `http://localhost:3000`

#### Acceso de red local (LAN)
1. Encuentre la IP de su servidor: `ip addr show` (Linux) o `ipconfig` (Windows)
2. Acceda desde cualquier dispositivo: `http://192.168.X.X:3000`
3. **Detección automática**: La aplicación detecta que está alojada y activa el modo servidor

#### Acceso a internet (opcional)
Consulte la [Guía de Implementación](PRODUCTION.md) para:
- Configurar un nombre de dominio
- Instalar un certificado SSL (HTTPS)
- Asegurar el acceso

### Actualización

#### Con Docker
```bash
docker compose pull
docker compose up -d
```

#### Sin Docker
```bash
git pull
pnpm install
pnpm build
pnpm start
```

#### Opción 1: PWA (Recomendado)
1. Acceda a su instancia OpenFamily (ej: `http://192.168.1.100:3000`)
2. En móvil: haga clic en "Agregar a pantalla de inicio"
3. En desktop: haga clic en el icono de instalación en la barra de direcciones
4. La aplicación se instalará como una aplicación nativa

#### Opción 2: Aplicaciones nativas móviles
- **Android**: Instale el APK disponible en las versiones
- **iOS**: Use TestFlight o compile desde el código fuente

#### Opción 3: Navegador web
Simplemente acceda a la URL de su servidor OpenFamily desde cualquier navegador moderno (Chrome, Safari, Firefox, Edge).

## 💾 Almacenamiento de datos

OpenFamily utiliza una arquitectura **servidor centralizado con PostgreSQL**:

### 🗄️ Arquitectura

- **Base de datos**: PostgreSQL (incluido en Docker Compose)
- **Servidor API**: Express.js (Node.js)
- **Sincronización**: Tiempo real vía API REST
- **Seguridad**: Token de autenticación, aislamiento por familia

### 📊 Datos almacenados

Todos los datos se almacenan en PostgreSQL:
- `shopping_items` - Lista de compras
- `tasks` - Tareas y horarios
- `appointments` - Citas
- `family_members` - Miembros de la familia (con información de salud)
- `recipes` - Recetas
- `meals` - Planificación de comidas
- `budgets` - Presupuestos mensuales
- `families` - Configuración de familias

### 🔄 Sincronización automática

- ✅ **Multi-dispositivos**: Acceda desde PC, tablet, smartphone
- ✅ **Tiempo real**: Las modificaciones son instantáneas
- ✅ **Detección automática**: La aplicación detecta el servidor en la red
- ✅ **Familia por defecto**: Configuración inicial automática

### 💾 Respaldo

Los datos PostgreSQL se persisten vía volúmenes Docker:

```bash
# Respaldar manualmente
docker exec openfamily-db pg_dump -U openfamily openfamily > backup.sql

# Restaurar desde un respaldo
docker exec -i openfamily-db psql -U openfamily openfamily < backup.sql
```

**Recomendación**: Configure respaldos automáticos diarios con cron o una herramienta de respaldo PostgreSQL.

## ✨ Funcionalidades avanzadas

### 🔔 Notificaciones inteligentes
- Recordatorios automáticos 30 minutos y 1 hora antes de cada cita
- Recordatorios 15 minutos y a la hora exacta para tareas con fecha límite
- Soporte de notificaciones del navegador (permiso requerido)

### 💡 Lista de compras inteligente
- Sugerencias automáticas de ingredientes basadas en sus comidas planificadas
- Análisis de recetas de la semana próxima
- Adición con un clic desde las sugerencias

### 📊 Estadísticas y panel de control
- Vista general de todas sus actividades
- Tasa de finalización de tareas (global y semanal)
- Uso del presupuesto en tiempo real con gráficos de evolución
- Tendencias de planificación de comidas
- Gráficos e indicadores visuales

### 🎯 Planificación automática de comidas
- Generación automática de una planificación semanal
- Selección inteligente basada en categorías de recetas
- Evita repeticiones en varios días
- Integración con sus recetas existentes

### 🔍 Búsqueda global
- Búsqueda instantánea en todos sus datos (Ctrl/Cmd+K)
- Resultados agrupados por categoría: compras, tareas, citas, recetas, comidas
- Navegación rápida a cualquier página

### 🚀 Acciones rápidas
- Widgets en la página de inicio para crear rápidamente tareas y artículos
- Adición vía formularios en línea con soporte de teclado (tecla Enter)
- Acceso directo a las funcionalidades principales

### 🌙 Tema automático
- Modo claro, oscuro o automático
- Detección automática de preferencias del sistema
- Ciclo entre los 3 modos con un simple clic

### 💾 Importar/Exportar datos
- Exportación completa en formato JSON con versionado
- Importación de respaldo con confirmación
- Respaldo manual o automático de todos sus datos

### ⚡ Adición rápida
- Botón flotante accesible desde toda la aplicación
- Adición express de tareas o artículos de compras
- Interfaz mínima para captura rápida

### 🩺 Seguimiento de salud familiar
- Grupo sanguíneo para cada miembro
- Lista de alergias
- Historial de vacunaciones con fechas y recordatorios
- Notas médicas personales
- Contacto de emergencia (nombre, teléfono, relación)

## 🛠️ Tecnologías

### Frontend
- **React 19 + TypeScript** - Interfaz de usuario moderna y tipada
- **Vite 7** - Herramienta de construcción ultra-rápida
- **TailwindCSS + shadcn/ui** - Sistema de diseño elegante y coherente
- **Wouter** - Enrutamiento ligero
- **date-fns** - Manipulación de fechas
- **Recharts** - Gráficos y visualizaciones

### Backend (Modo Servidor)
- **Node.js 20+ + Express** - API REST
- **PostgreSQL 16** - Base de datos relacional
- **TypeScript** - Tipado del backend
- **Docker + Docker Compose** - Contenarización e implementación

### Almacenamiento
- **localStorage** - Modo local (navegador)
- **PostgreSQL** - Modo servidor (auto-alojado)
- **Repository Pattern** - Abstracción del almacenamiento para ambos modos

### Móvil
- **Capacitor** - Construcción Android/iOS
- **Service Worker** - Modo fuera de línea (PWA)

## 📱 Compatibilidad

- Chrome/Edge (desktop y móvil)
- Safari (iOS y macOS)
- Firefox
- Cualquier navegador moderno que soporte localStorage y Service Workers

## 🔐 Privacidad

Esta aplicación respeta su privacidad según el modo elegido:

### Modo Local
- ❌ No envía **ningún dato** a servidores externos
- ❌ No usa **ninguna base de datos** centralizada
- ❌ No requiere **ninguna cuenta de usuario**
- ✅ Almacena **todo localmente** en su dispositivo
- ✅ Funciona **completamente fuera de línea**

### Modo Servidor
- ✅ **Usted controla la infraestructura** - Aloje en su propio servidor
- ✅ **Ningún tercero involucrado** - No hay nube externa
- ✅ **Cifrado en tránsito** - HTTPS recomendado
- ✅ **Código Abierto** - Código verificable y auditable
- 📝 **Responsabilidad** - Usted gestiona la seguridad de su servidor

---

## ❓ Preguntas frecuentes

### ¿Están seguros mis datos?
**Modo Local**: Sí, todos sus datos se almacenan localmente en su navegador. Nunca salen de su dispositivo.

**Modo Servidor**: Sus datos se almacenan en su propio servidor. Tiene control total y responsabilidad de la seguridad.

### ¿Puedo usar la aplicación fuera de línea?
**Modo Local**: ¡Absolutamente! Una vez instalada como PWA, la aplicación funciona completamente fuera de línea.

**Modo Servidor**: Se necesita conexión al servidor para sincronizar datos. Las funcionalidades fuera de línea pueden estar limitadas.

### ¿Cómo respaldar mis datos?
**Modo Local**: Vaya a Configuración → Respaldo para descargar un archivo JSON con todos sus datos.

**Modo Servidor**: Configure respaldos automáticos de su base de datos PostgreSQL (vea [DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### ¿La aplicación está disponible en varios idiomas?
¡Sí! La interfaz está disponible en **Francés 🇫🇷**, **Inglés 🇬🇧**, **Alemán 🇩🇪** y **Español 🇪🇸**. Puede cambiar el idioma durante la configuración inicial o en Configuración.

### ¿La aplicación funciona en iOS?
Sí, puede instalarla como PWA desde Safari. En Android, también puede instalar el APK.

### ¿Puedo sincronizar entre varios dispositivos?
**Modo Local**: Use la función de exportar/importar para transferir manualmente sus datos.

**Modo Servidor**: ¡Sí! El modo servidor auto-alojado permite sincronización automática entre todos los dispositivos de la familia.

### ¿La aplicación es realmente gratuita?
Sí, 100% gratuita y de código abierto. Sin costos ocultos, sin suscripciones.

---

## 📄 Licencia

AGPL-3.0 con cláusula no comercial - El proyecto es de código abierto y se puede bifurcar, pero el uso comercial requiere autorización explícita. Vea el archivo [LICENSE](LICENSE) para más detalles.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! No dude en:
- Abrir issues para reportar bugs
- Proponer mejoras
- Enviar pull requests

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para las directrices de contribución.

## 📚 Documentación

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitectura técnica y patrón Repository
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Guía de implementación del servidor (Docker, PostgreSQL, Nginx)
- [CONTRIBUTING.md](CONTRIBUTING.md) - Guía de contribución
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Código de conducta
- [CHANGELOG.md](CHANGELOG.md) - Historial de versiones

---

<div align="center">

Hecho con ❤️ por [NexaFlow](https://github.com/NexaFlowFrance)

[⬆ Volver arriba](#openfamily)

</div>
