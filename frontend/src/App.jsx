import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import SellerDashboard from './pages/SellerDashboard';
import ConsumerDashboard from './pages/ConsumerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import RoleSwitcher from './components/RoleSwitcher';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) setActiveRole(session.user.user_metadata?.role || 'consumer');
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) setActiveRole(session.user.user_metadata?.role || 'consumer');
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  const roleSwitcher = <RoleSwitcher activeRole={activeRole || 'consumer'} onChangeRole={setActiveRole} />;

  if (activeRole === 'admin') {
    return <AdminDashboard user={user} onLogout={handleLogout} roleSwitcher={roleSwitcher} />;
  } else if (activeRole === 'seller') {
    return <SellerDashboard user={user} onLogout={handleLogout} roleSwitcher={roleSwitcher} />;
  }

  return <ConsumerDashboard user={user} onLogout={handleLogout} roleSwitcher={roleSwitcher} />;
}
