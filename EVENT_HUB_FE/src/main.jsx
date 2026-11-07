import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { FilterProvider } from './context/FilterContext.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Dữ liệu dashboard coi là mới trong 60 giây; tránh gọi lại khi chuyển trang qua lại.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FilterProvider>
        <App />
      </FilterProvider>
    </QueryClientProvider>
  </StrictMode>,
)
