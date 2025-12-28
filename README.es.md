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

OpenFamily es una aplicación completa de gestión familiar que prioriza su privacidad. Todos sus datos permanecen en su dispositivo, sin servidor central, sin cuenta requerida. Gestione sus listas de compras, tareas, citas, recetas, planificación de comidas y presupuesto familiar de forma segura.

## 🚀 Características principales

- ✅ **100% Local o Auto-alojado** - Elija entre almacenamiento local o servidor auto-alojado para sincronización familiar
- 📱 **PWA** - Instale la aplicación como una aplicación nativa en móvil/tablet
- 🔒 **Privado** - Sus datos nunca salen de su dispositivo (modo local) o permanecen en su servidor (modo servidor)
- 🌐 **Sin conexión** - Funciona sin conexión a internet en modo local
- 🆓 **Código Abierto** - Código fuente libre y modificable
- 🌍 **Multi-idioma** - Interfaz disponible en francés, inglés, alemán y español
- 🌙 **Tema oscuro** - Modos claro y oscuro disponibles
- 💡 **Lista inteligente** - Sugerencias de ingredientes basadas en sus comidas planificadas
- 👨‍👩‍👧‍👦 **Multi-usuario** - Gestione toda la familia con información de salud

## 📋 Funcionalidades

- 🛒 **Lista de compras** - Categorización automática, precios y cantidades
- ✅ **Tareas** - Tareas recurrentes, asignación familiar
- 📅 **Citas** - Calendario mensual con vista francesa
- 🍳 **Recetas** - Biblioteca de recetas familiares
- 🍽️ **Planificación de comidas** - Vista semanal con enlace automático
- 💰 **Presupuesto** - Seguimiento mensual de gastos
- 👨‍👩‍👧‍👦 **Gestión familiar** - Perfiles con información de salud

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
