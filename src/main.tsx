import ReactDOM from 'react-dom/client'
import App from './App'
import { prewarmMilp } from './lib/solver/milpCore'
import './styles.css'

// Pre-warm WebAssembly MILP singleton on initialization
void prewarmMilp()

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
