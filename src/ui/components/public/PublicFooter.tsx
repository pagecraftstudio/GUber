import React from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { Bus, Phone, Mail, MapPin, Heart } from 'lucide-react';

export const PublicFooter: React.FC = () => {
  const { currentCompany } = useTenant();
  const { locale, t } = useLocale();

  return (
    <footer className="bg-[#14243A] text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Brand Info */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2 text-white">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: currentCompany.accentColor || '#3563E9' }}
              >
                <Bus className="w-4 h-4" />
              </div>
              <span className="font-bold text-lg text-white">
                {locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              {locale === 'ar' ? currentCompany.taglineAr : currentCompany.taglineEn}
            </p>
            <div className="pt-2 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {locale === 'ar' ? currentCompany.supportAddressAr : currentCompany.supportAddressEn}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span dir="ltr" className="tabular-nums">{currentCompany.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{currentCompany.email}</span>
              </div>
            </div>
          </div>

          {/* Col 2: Campus Routes */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              {t('directRoutesFooter')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>{t('cairoGalala')}</li>
              <li>{t('newCairoGalala')}</li>
              <li>{t('suezGalala')}</li>
              <li>{t('ismailiaGalala')}</li>
              <li>{t('alexGalala')}</li>
            </ul>
          </div>

          {/* Col 3: Student Transit Policies */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              {t('studentPoliciesFooter')}
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>{t('studentDiscount15')}</li>
              <li>{t('freeLuggage25kg')}</li>
              <li>{t('cancellation3hrs')}</li>
              <li>{t('cashAndPosPayments')}</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} {locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn}. {t('allRightsReserved')}
          </p>
          <div className="flex items-center gap-2 text-[11px]">
            <span>{t('poweredByMalaky')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
