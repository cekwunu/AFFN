import 'server-only';
import { getTranslations } from 'next-intl/server';
import { sortAllergens } from './products';

/** "Inneholder: Melk, Sesamfrø" or "Inneholder ingen av de 14 allergenene". */
export async function allergenSummary() {
  const t = await getTranslations('Allergens');
  return (allergens: readonly string[]) => {
    const sorted = sortAllergens(allergens);
    return sorted.length ? t('contains', { list: sorted.map((a) => t(a)).join(', ') }) : t('none');
  };
}
