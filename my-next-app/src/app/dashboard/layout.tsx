import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <OnboardingGuide />
    </>
  );
}