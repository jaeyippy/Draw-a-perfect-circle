import React from 'react'
import ReactDOM from 'react-dom/client'
// import { Agentation } from 'agentation'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {/* {import.meta.env.DEV && <Agentation />} */}
  </React.StrictMode>,
)
