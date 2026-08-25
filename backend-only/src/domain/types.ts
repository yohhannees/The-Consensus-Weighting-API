export interface Allocation {
  userId: string;
  targetId: string;
  amount: number;
}

export interface TargetWeight {
  targetId: string;
  rawTotal: number;
  uniqueUserCount: number;
  weight: number;
}
