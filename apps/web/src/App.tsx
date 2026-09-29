import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './context/AuthContext.js';
import { LocationProvider } from './context/LocationContext.js';
import { AppRoutes } from './routes/AppRoutes.js';
import './styles/app.css';

export const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
        },
      }}
    >
      <AuthProvider>
        <LocationProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LocationProvider>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;
