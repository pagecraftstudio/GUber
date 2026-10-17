import React from 'react';
import { SubscriptionPlan } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface SubscriptionsManagerProps {
  plans: SubscriptionPlan[];
}

export const SubscriptionsManager: React.FC<SubscriptionsManagerProps> = ({ plans }) => {
  const { locale, t } = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          {t('subscriptionPlans')}
        </h2>
        <p className="text-xs text-slate-500">
          SaaS pricing tiers and platform commercial licensing for Egyptian bus fleet operators.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isGrowth = plan.id === 'growth';

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-6 border flex flex-col justify-between shadow-xs transition-shadow relative ${
                isGrowth
                  ? 'border-[#3563E9] ring-2 ring-[#3563E9]/20'
                  : 'border-slate-200'
              }`}
            >
              {isGrowth && (
                <div className="absolute -top-3 start-6 px-3 py-0.5 rounded-full bg-[#3563E9] text-white text-[11px] font-bold tracking-wide uppercase">
                  Most Popular
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {locale === 'ar' ? plan.nameAr : plan.nameEn}
                </h3>

                <div className="mt-4 mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                      {plan.monthlyFeeEgp.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">{t('egp')} / month</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Plus {plan.perBookingFeePercent}% platform transaction fee per ticket
                  </span>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-slate-500">Fleet Coaches</span>
                    <strong className="text-slate-900 tabular-nums">Up to {plan.maxBuses}</strong>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-slate-500">Intercity Routes</span>
                    <strong className="text-slate-900 tabular-nums">Up to {plan.maxRoutes}</strong>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                      Included Capabilities
                    </span>
                    {(locale === 'ar' ? plan.featuresAr : plan.featuresEn).map((feat: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0F9D8A] shrink-0 mt-0.5" />
                        <span className="leading-tight">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
