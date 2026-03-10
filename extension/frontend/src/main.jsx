import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PopupLayout from './PopupLayout.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PopupLayout />
  </StrictMode>,
)
