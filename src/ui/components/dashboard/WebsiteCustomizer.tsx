import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Palette, CheckCircle, ExternalLink, Sparkles, Bus, UploadCloud, FileEdit, CheckCircle2 } from 'lucide-react';

export const WebsiteCustomizer: React.FC = () => {
  const { currentCompany, updateCompany, setActiveView, reloadCompanies } = useTenant();
  const { locale, t } = useLocale();

  const activeConfig = currentCompany.draftWebsiteConfig || currentCompany.websiteConfig;

  const [nameEn, setNameEn] = useState(currentCompany.nameEn);
  const [nameAr, setNameAr] = useState(currentCompany.nameAr);
  const [primaryColor, setPrimaryColor] = useState(currentCompany.primaryColor);
  const [accentColor, setAccentColor] = useState(currentCompany.accentColor);
  const [heroTitleEn, setHeroTitleEn] = useState(activeConfig.heroTitleEn);
  const [heroTitleAr, setHeroTitleAr] = useState(activeConfig.heroTitleAr);
  const [heroSubtitleEn, setHeroSubtitleEn] = useState(activeConfig.heroSubtitleEn);
  const [heroSubtitleAr, setHeroSubtitleAr] = useState(activeConfig.heroSubtitleAr);
  const [heroNoticeEn, setHeroNoticeEn] = useState(activeConfig.heroNoticeEn);
  const [heroNoticeAr, setHeroNoticeAr] = useState(activeConfig.heroNoticeAr);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setFeedback(null);
    try {
      const draftConfig = {
        ...activeConfig,
        heroTitleEn,
        heroTitleAr,
        heroSubtitleEn,
        heroSubtitleAr,
        heroNoticeEn,
        heroNoticeAr,
      };

      await transportService.saveDraftWebsiteConfig(currentCompany.id, draftConfig);
      await updateCompany({
        nameEn,
        nameAr,
        primaryColor,
        accentColor,
        draftWebsiteConfig: draftConfig,
      });

      setSavingDraft(false);
      setFeedback(locale === 'ar' ? 'تم حفظ المسودة بنجاح (لم يتم النشر للعامة)' : 'Draft saved successfully (not published to visitors yet).');
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setFeedback(null);
    try {
      const configToPublish = {
        ...activeConfig,
        heroTitleEn,
        heroTitleAr,
        heroSubtitleEn,
        heroSubtitleAr,
        heroNoticeEn,
        heroNoticeAr,
      };

      await transportService.saveDraftWebsiteConfig(currentCompany.id, configToPublish);
      await transportService.publishWebsiteConfig(currentCompany.id);
      await updateCompany({
        nameEn,
        nameAr,
        primaryColor,
        accentColor,
        websiteConfig: configToPublish,
        publishedWebsiteConfig: configToPublish,
        draftWebsiteConfig: configToPublish,
      });
      await reloadCompanies();

      setPublishing(false);
      setFeedback(locale === 'ar' ? 'تم نشر التعديلات بنجاح على موقع الركاب العام!' : 'Website branding successfully published to live public site!');
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {t('brandingSettings')}
            </h2>
            {/* Correction #5 Draft vs Published Badge */}
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
              {t('draftVersion')}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {locale === 'ar'
              ? 'تعديل هوية الموقع وتجربة المسودة قبل نشرها للركاب على الرابط العام.'
              : 'Customize branding and edit draft website configurations with strict separation before live publication.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('public')}
          >
            {t('previewLiveSite')}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Editor Form */}
        <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          {/* Identity */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('operatorIdentityColors')}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('companyNameEn')}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                required
              />
              <Input
                label={t('companyNameAr')}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('brandColor')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-9 h-9 rounded border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-24 text-xs font-mono uppercase px-2 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('accentColor')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-9 h-9 rounded border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-24 text-xs font-mono uppercase px-2 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Hero Section Copy */}
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('homepageCopySection')}
            </h3>

            <Input
              label={`${t('heroHeadline')} (English)`}
              value={heroTitleEn}
              onChange={(e) => setHeroTitleEn(e.target.value)}
              required
            />
            <Input
              label={`${t('heroHeadline')} (العربية)`}
              value={heroTitleAr}
              onChange={(e) => setHeroTitleAr(e.target.value)}
              required
            />

            <Input
              label={`${t('heroSubheadline')} (English)`}
              value={heroSubtitleEn}
              onChange={(e) => setHeroSubtitleEn(e.target.value)}
              required
            />
            <Input
              label={`${t('heroSubheadline')} (العربية)`}
              value={heroSubtitleAr}
              onChange={(e) => setHeroSubtitleAr(e.target.value)}
              required
            />

            <Input
              label={`${t('announcementBanner')} (English)`}
              value={heroNoticeEn}
              onChange={(e) => setHeroNoticeEn(e.target.value)}
            />
            <Input
              label={`${t('announcementBanner')} (العربية)`}
              value={heroNoticeAr}
              onChange={(e) => setHeroNoticeAr(e.target.value)}
            />
          </div>

          {/* Dual Action: Save Draft vs Publish Live (Correction #5) */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              loading={savingDraft}
              onClick={handleSaveDraft}
              icon={<FileEdit className="w-4 h-4" />}
            >
              {t('saveDraftOnly')}
            </Button>

            <Button
              type="button"
              size="md"
              loading={publishing}
              onClick={handlePublish}
              icon={<UploadCloud className="w-4 h-4" />}
            >
              {t('publishNow')}
            </Button>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('livePreview')}
            </h3>
            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono">
              Draft Visualizer
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
            {/* Header Mock */}
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Bus className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs text-slate-900">{locale === 'ar' ? nameAr : nameEn}</span>
              </div>
              <span
                className="px-2.5 py-1 rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                {t('bookNow')}
              </span>
            </div>

            {/* Hero Mock */}
            <div
              className="p-5 text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {(locale === 'ar' ? heroNoticeAr : heroNoticeEn) && (
                <div className="inline-block px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-amber-300 font-medium mb-2">
                  {locale === 'ar' ? heroNoticeAr : heroNoticeEn}
                </div>
              )}
              <h4 className="text-sm font-bold leading-tight">{locale === 'ar' ? heroTitleAr : heroTitleEn}</h4>
              <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                {locale === 'ar' ? heroSubtitleAr : heroSubtitleEn}
              </p>
            </div>

            {/* Content Mock */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/60 text-xs text-slate-500">
              <div className="flex justify-between items-center">
                <span>{t('cairoGalala')}</span>
                <strong className="text-slate-900">140 {t('egp')}</strong>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <span className="font-bold block">{t('whiteLabelIsolation')}</span>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              {t('isolationGuaranteeDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
