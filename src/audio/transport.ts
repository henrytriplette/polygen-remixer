export interface StepAdvance {
  nextStep: number;
  finished: boolean;
}

export function advanceTransportStep(
  currentStep: number,
  totalSteps: number,
  loop: boolean,
): StepAdvance {
  const nextStep = (currentStep + 1) % totalSteps;
  return { nextStep, finished: nextStep === 0 && !loop };
}