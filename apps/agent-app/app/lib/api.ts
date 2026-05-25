import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("agent_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function saveSession(token: string, agentId: string): Promise<void> {
  await AsyncStorage.multiSet([["agent_token", token], ["agent_id", agentId]]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove(["agent_token", "agent_id"]);
}

export async function getAgentId(): Promise<string | null> {
  return AsyncStorage.getItem("agent_id");
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("agent_token");
}
