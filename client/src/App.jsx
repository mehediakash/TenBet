import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import store from "./Components/store";
import { LanguageProvider } from "./context/LanguageContext";
import CasinoGameModal from "./Components/CasinoGameModal/CasinoGameModal";

// Pages
import Home from "./pages/home";
import NotFound from "./pages/NotFound";

import Login from "./Components/Auth/Login";
import Register from "./Components/Auth/Register";
import VerifyOtp from "./Components/Auth/VerifyOtp";
import ForgotPassword from "./Components/Auth/ForgotPassword";
import ResetPassword from "./Components/Auth/ResetPassword";
import Profile from "./Components/Profile/Profile";
import BetHistory from "./Components/Bet/BetHistory";
import BetDetails from "./Components/Bet/BetDetails";
import PlaceBet from "./Components/Bet/PlaceBet";
import SportsPage from "./Components/Sports/SportsPage";

// Layout & Protected Route
import ResponsiveLayout from "./Components/Layouts/ResponsiveLayout"; // Responsive desktop/mobile layout
import ProtectedRoute from "./Components/ProtectedRoute/ProtectedRoute";
import DepositPage from "./pages/DepositPage";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import WithdrawPage from "./pages/WithdrawPage";
import PromotionsPage from "./pages/PromotionsPage";
import About from "./pages/About";
import Casino from "./pages/Casino";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import ResponsibleGaming from "./pages/ResponsibleGaming";
import LiveBetting from "./pages/LiveBetting";
import Sports from "./pages/Sports";
import GamesPage from "./pages/Games/GamesPage";
import ScrollToTop from "./Components/ScrollToTop/ScrollToTop";

export default function App() {
  return (
    <Provider store={store}>
      <LanguageProvider>
        <BrowserRouter>
          {/* <ScrollToTop /> */}
          <Routes>
            {/* Public Layout */}
            <Route element={<ResponsiveLayout />}>
              <Route index element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/deposit" element={<DepositPage />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route path="/withdraw" element={<WithdrawPage />} />
              <Route path="/promotions" element={<PromotionsPage />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route path="/forgot" element={<ForgotPassword />} />
              <Route path="/reset" element={<ResetPassword />} />
              <Route path="/sports" element={<SportsPage />} />
              <Route path="/about" element={<About />} />
              <Route path="/casino" element={<Casino />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route
                path="/responsible-gaming"
                element={<ResponsibleGaming />}
              />
              <Route path="/live-betting" element={<LiveBetting />} />
              <Route path="/sports-betting" element={<Sports />} />
              <Route path="/games" element={<GamesPage />} />
            </Route>

            {/* Protected Route */}
            <Route element={<ResponsiveLayout />}>
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bets"
                element={
                  <ProtectedRoute>
                    <BetHistory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bets/:betSlipId"
                element={
                  <ProtectedRoute>
                    <BetDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/place-bet"
                element={
                  <ProtectedRoute>
                    <PlaceBet />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CasinoGameModal />
        </BrowserRouter>
      </LanguageProvider>
    </Provider>
  );
}
