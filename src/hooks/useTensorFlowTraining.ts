import { useState, useCallback, useEffect, useRef } from "react";
import { ModelTrainingSummary } from "../types";

export interface TrainingParams {
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  epochs?: number;
  strategyMode?: "conservative" | "balanced" | "aggressive";
  trendWeight?: number;
  meanReversionWeight?: number;
  tpMultiplier?: number;
  slMultiplier?: number;
}

export interface EpochMetric {
  epoch: number;
  loss: number;
  accuracy: number;
}

const STORAGE_KEY_SUMMARY = "nodetrade_tf_training_summary";

export function useTensorFlowTraining() {
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [totalEpochs, setTotalEpochs] = useState<number>(50);
  const [currentLoss, setCurrentLoss] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [epochHistory, setEpochHistory] = useState<EpochMetric[]>([]);
  const [trainingSummary, setTrainingSummary] = useState<ModelTrainingSummary | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SUMMARY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to persist summary to localStorage
  const updateSummary = useCallback((summary: ModelTrainingSummary | null) => {
    setTrainingSummary(summary);
    if (summary) {
      try {
        localStorage.setItem(STORAGE_KEY_SUMMARY, JSON.stringify(summary));
      } catch (e) {
        console.error("Failed to save training summary to localStorage", e);
      }
    }
  }, []);

  // Fetch training status from server
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/market/training-status");
      if (!res.ok) return;
      const data = await res.json();

      if (data.isTraining) {
        setIsTraining(true);
        if (data.currentEpoch) setCurrentEpoch(data.currentEpoch);
        if (data.totalEpochs) setTotalEpochs(data.totalEpochs);
        if (data.currentLoss !== undefined) setCurrentLoss(data.currentLoss);
        if (data.currentAccuracy !== undefined) setCurrentAccuracy(data.currentAccuracy);

        // Auto-resume polling on mount/refresh if training is active on server
        if (!pollIntervalRef.current) {
          startPolling();
        }
      } else {
        setIsTraining(false);
        if (data.summary) {
          updateSummary(data.summary);
          if (data.currentLoss !== undefined) setCurrentLoss(data.currentLoss);
          if (data.currentAccuracy !== undefined) setCurrentAccuracy(data.currentAccuracy);
        }
      }
    } catch (err) {
      console.error("[useTensorFlowTraining] Error checking status:", err);
    }
  }, [updateSummary]);

  // Start polling when training begins
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/market/training-status");
        if (!res.ok) return;
        const data = await res.json();

        if (data.isTraining) {
          setIsTraining(true);
          setCurrentEpoch(data.currentEpoch || 0);
          setTotalEpochs(data.totalEpochs || 50);
          setCurrentLoss(data.currentLoss !== undefined ? data.currentLoss : null);
          setCurrentAccuracy(data.currentAccuracy !== undefined ? data.currentAccuracy : null);

          if (data.currentEpoch && data.currentLoss !== null) {
            setEpochHistory((prev) => {
              if (prev.some((e) => e.epoch === data.currentEpoch)) return prev;
              return [
                ...prev,
                {
                  epoch: data.currentEpoch,
                  loss: data.currentLoss,
                  accuracy: data.currentAccuracy || 0,
                },
              ];
            });
          }
        } else {
          // Training completed
          setIsTraining(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (data.summary) {
            updateSummary(data.summary);
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 400);
  }, [updateSummary]);

  // Check status on mount and when tab becomes visible
  useEffect(() => {
    checkStatus();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [checkStatus]);

  /**
   * Trigger backend TensorFlow.js training pipeline with persistent server tracking
   */
  const trainModel = useCallback(
    async (params: TrainingParams): Promise<ModelTrainingSummary | null> => {
      setIsTraining(true);
      setError(null);
      setEpochHistory([]);
      setCurrentEpoch(0);
      const requestedEpochs = Math.max(1, Math.min(500, params.epochs || 50));
      setTotalEpochs(requestedEpochs);

      // Start polling status immediately to receive live progress
      startPolling();

      try {
        const response = await fetch("/api/market/train", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Server error ${response.status}`);
        }

        const result = await response.json();
        const finalSummary: ModelTrainingSummary = result.trainingSummary;

        updateSummary(finalSummary);
        if (finalSummary.loss !== undefined) setCurrentLoss(finalSummary.loss);
        if (finalSummary.tensorflowAccuracy !== undefined) setCurrentAccuracy(finalSummary.tensorflowAccuracy);

        return finalSummary;
      } catch (err: any) {
        console.error("[useTensorFlowTraining] Training error:", err);
        setError(err?.message || "Training failed");
        return null;
      } finally {
        setIsTraining(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    },
    [startPolling, updateSummary]
  );

  return {
    isTraining,
    currentEpoch,
    totalEpochs,
    currentLoss,
    currentAccuracy,
    epochHistory,
    trainingSummary,
    error,
    trainModel,
    setTrainingSummary: updateSummary,
  };
}
