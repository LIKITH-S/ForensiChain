import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getHealth, getActors, getActiveActorRole, setActiveActorRole } from "../api/client";

const ActorContext = createContext(null);

export function ActorProvider({ children }) {
  const [activeRole, setActiveRoleState] = useState(() => getActiveActorRole());
  const [roles, setRoles] = useState({});
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState(null);

  const refreshDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const healthData = await getHealth();
      setHealth(healthData);
      setRoles(healthData.roles || {});
      setApiOnline(true);
    } catch (err) {
      setApiOnline(false);
      setError(err.message || "Cannot connect to ForensiChain REST API");
      // Fallback mock role directory so UI still renders
      setRoles({
        ADMIN: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        COLLECTOR: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        CUSTODIAN: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        EXAMINER: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        AUDITOR: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        CUSTODIAN_SECONDARY: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
        UNAUTHORIZED: "0x976EA74026E726554dB657fA54763abd0C3a0aa9"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  const setActiveRole = (newRole) => {
    setActiveActorRole(newRole);
    setActiveRoleState(newRole);
  };

  const activeAddress = roles[activeRole] || null;

  return (
    <ActorContext.Provider
      value={{
        activeRole,
        setActiveRole,
        activeAddress,
        roles,
        health,
        loading,
        apiOnline,
        error,
        refreshDirectory
      }}
    >
      {children}
    </ActorContext.Provider>
  );
}

export function useActor() {
  const context = useContext(ActorContext);
  if (!context) {
    throw new Error("useActor must be used within an ActorProvider");
  }
  return context;
}
