# SeaYou - Marine Weather Dashboard 🌊

[![Deploy to GitHub Pages](https://github.com/Ben1137/SeaYou/actions/workflows/deploy.yml/badge.svg)](https://github.com/Ben1137/SeaYou/actions/workflows/deploy.yml)

SeaYou is a comprehensive, real-time marine weather dashboard designed for sailors, surfers, kite surfers, and beachgoers. It leverages the Open-Meteo API to provide high-resolution marine and atmospheric data, presented through a beautiful, interactive, and responsive UI.

## 🌐 Live Demo

**Try it now:** [https://ben1137.github.io/SeaYou/](https://ben1137.github.io/SeaYou/)

The app is deployed on GitHub Pages and updates automatically with every push to the main branch.

## 🚀 Features

### 📊 Real-Time Marine Data

- **Activity Reports**: Dedicated summary cards for Sailing conditions, Surf ratings, Pole Surfing (Kite), and Beach comfort levels.
- **Dynamic Icons**: Visual indicators that update based on live conditions (e.g., Waves vs. Swell icons, detailed weather animations).
- **Live Metrics**: Real-time display of:
  - Wind Speed & Direction
  - Wave Height & Period
  - Swell Height, Direction & Period
  - Air & Sea Temperatures

### 📈 Interactive Graphs

- **Tabbed Interface**: Seamlessly switch between **Tide Schedules**, **Wave Forecasts**, and **Swell Forecasts**.
- **Advanced Visualization**:
  - Dual-axis charts combining height (Area) and period (Line).
  - Tide charts with clear High/Low event markers and Mean Sea Level indication.
  - Interactive tooltips for precise data analysis.

### 📅 Detailed Forecasts

- **Persona-Based Tables**: Tailored 24-hour forecast views for different users:
  - **Mariner**: Pressure, Sea State, Visibility, Wind, Swell.
  - **Surfer**: Detailed Wave vs. Swell analysis, Period, and experimental Surf Ratings.
  - **Kite Surfer**: Wind Speed vs. Gusts, Direction, and riding conditions.
  - **Beachgoer**: UV Index, "Sand Wind" factor, Temperature, and general comfort.

### ⚡ Alert System

- **Customizable Thresholds**: User-configurable settings for Wave Height and Wind Speed alerts.
- **Visual Warnings**:
  - **Storm Warning**: Severe weather conditions.
  - **Rough Weather Advisory**: High winds/seas.
  - **Tsunami Simulation**: Experimental alert mode for high-impact wave events.

## 🛠️ Tech Stack

- **Frontend Framework**: [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Source**: [Open-Meteo API](https://open-meteo.com/) (Marine & Forecast APIs)
- **Date Handling**: [date-fns](https://date-fns.org/)
- **Deployment**: GitHub Actions → GitHub Pages

## 📦 Local Development

### Prerequisites

- Node.js 18+ and npm

### Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Ben1137/SeaYou.git
    cd SeaYou
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the development server:**

    ```bash
    npm run dev
    ```

4.  **Open in Browser:**
    Navigate to `http://localhost:3000` (or the port shown in your terminal).

### Build for Production

```bash
npm run build
```

The optimized production build will be in the `dist/` directory.

## 🚀 Deployment

This project uses **GitHub Actions** for automatic deployment to GitHub Pages.

### How It Works

1. Push changes to the `main` branch
2. GitHub Actions automatically builds the app
3. Deploys to GitHub Pages (usually takes 2-3 minutes)
4. Live site updates at: https://ben1137.github.io/SeaYou/

### Deployment Configuration

- **Workflow**: `.github/workflows/deploy.yml`
- **Build Tool**: Vite with base path `/SeaYou/`
- **Hosting**: GitHub Pages (free, HTTPS enabled)

### Manual Deployment

You can also trigger a deployment manually:

1. Go to the [Actions tab](https://github.com/Ben1137/SeaYou/actions)
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

## 🌍 Configuration

### API Integration

No API keys are required for the default Open-Meteo integration. The app makes client-side requests to:

- `https://marine-api.open-meteo.com/v1/marine`
- `https://api.open-meteo.com/v1/forecast`

### Location Settings

To modify the default location, update the coordinates in `App.tsx` or passed to the `Dashboard` component.

## 🚀 Deployment

SeaYou deploys to two targets, each requiring a different `VITE_PWA_BASE` value so the PWA manifest `scope`, `start_url`, and icon paths resolve correctly.

| Target | URL | `VITE_PWA_BASE` | How it's set |
|---|---|---|---|
| **Vercel** (primary) | `sea-you1-0-app.vercel.app/` | `/` | Vercel dashboard → Environment Variables |
| **GitHub Pages** | `ben1137.github.io/SeaYou1.0/` | `/SeaYou1.0/` | `.github/workflows/deploy.yml` (automatic) |

**Vercel setup (one-time):** In the Vercel dashboard → Settings → Environment Variables, add `VITE_PWA_BASE=` `/` for Production, Preview, and Development.

**GitHub Pages:** `.github/workflows/deploy.yml` sets `VITE_PWA_BASE=/SeaYou1.0/` automatically on every push to `main`.

See [.env.example](.env.example) for all configurable environment variables.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available for personal and educational use.

## 🙏 Acknowledgments

- Marine and weather data provided by [Open-Meteo](https://open-meteo.com/)
- Icons by [Lucide](https://lucide.dev/)
- Charts powered by [Recharts](https://recharts.org/)

---

**Live Demo:** [https://ben1137.github.io/SeaYou/](https://ben1137.github.io/SeaYou/) 🌊⛵
