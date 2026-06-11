import { BrowserRouter, Routes, Route } from 'react-router';
import { HomeScreen }    from '../portal/screens/HomeScreen';
import { LoginScreen }   from '../portal/screens/LoginScreen';
import { FlowScreen }    from '../portal/screens/FlowScreen';
import { ConfirmScreen } from '../portal/screens/ConfirmScreen';
import { DemoBanner }    from '../portal/components/DemoBanner';
import { VerifyApp }     from './VerifyApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<HomeScreen />} />
        <Route path="/login"   element={<LoginScreen />} />
        <Route path="/flow"    element={<FlowScreen />} />
        <Route path="/confirm" element={<ConfirmScreen />} />
        <Route path="/verify"  element={<VerifyApp />} />
      </Routes>
      <DemoBanner />
    </BrowserRouter>
  );
}
