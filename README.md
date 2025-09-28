# Members Game - Golf Handicap Management System

A lightweight React application for managing golf games based on registered member handicaps.

## 🏌️ Features (Planned)

- **Member Management**: Register and track member handicaps
- **Game Creation**: Create golf games with handicap-based scoring
- **Tournament Organization**: Organize and manage golf tournaments
- **Handicap Tracking**: Monitor and update member handicaps over time

## 🚀 Tech Stack

- **Frontend Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Testing**: Vitest + React Testing Library
- **Linting**: ESLint with TypeScript support

## 📦 Installation

1. Install dependencies:
```bash
npm install
```

## 🛠️ Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 🧪 Testing

Run tests:
```bash
npm run test
```

Run tests with UI:
```bash
npm run test:ui
```

Run tests with coverage:
```bash
npm run test:coverage
```

## 🚀 Deployment to GitHub Pages

This application is configured to be deployed to GitHub Pages. Follow these steps to deploy:

1. Ensure your repository is pushed to GitHub and named `MembersGame` (case-sensitive)
2. Run the deployment command:
   ```bash
   npm run deploy
   ```
3. Go to your repository on GitHub and navigate to Settings > Pages
4. Under "Source", select "GitHub Actions" as the source
5. The site will be available at: `https://perrtyler.github.io/MembersGame`

### Important Notes:
- The repository must be public unless you have a GitHub Pro account
- The first deployment might take a few minutes to complete
- After deployment, it might take a few minutes for the site to be available
- If you rename your repository, update the `homepage` field in `package.json` and the `base` in `vite.config.ts`

## 🛠️ Development

For local development, start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🔧 Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
├── test/               # Test utilities and setup
├── App.tsx             # Main App component
├── main.tsx            # Application entry point
└── index.css           # Global styles
```

## 🎯 Getting Started

This is a fresh Vite + React + TypeScript shell ready for development. The basic structure includes:

- ✅ React 18 with TypeScript
- ✅ Vite for fast development and building
- ✅ React Testing Library for component testing
- ✅ ESLint for code quality
- ✅ Basic styling and layout
- ✅ Sample test to verify setup

Start building your golf handicap management features by creating components in the `src/components` directory!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
