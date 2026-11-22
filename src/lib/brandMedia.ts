import heroSpecialtyCoffee from '../assets/images/hero_specialty_coffee_1795207823698.jpg';
import storyCraftBar from '../assets/images/story_craft_bar_1795207824308.jpg';
import coffeeEspressoStudio from '../assets/images/coffee_espresso_studio_1795207824176.jpg';
import coffeeMatchaCold from '../assets/images/coffee_matcha_cold_1795207825097.jpg';
import coffeeArtisanPastry from '../assets/images/coffee_artisan_pastry_1795207824755.jpg';

export const BRAND_MEDIA = {
  heroCoffee: heroSpecialtyCoffee,
  storyCraft: storyCraftBar,
  espressoV60: coffeeEspressoStudio,
  matchaCold: coffeeMatchaCold,
  bakeryFood: coffeeArtisanPastry,
} as const;

export function getCategoryArtwork(category: string): string {
  const clean = category.trim().toLowerCase();
  if (clean.includes('matcha') || clean.includes('cold') || clean.includes('ماتشا') || clean.includes('بارد')) {
    return BRAND_MEDIA.matchaCold;
  }
  if (clean.includes('food') || clean.includes('bakery') || clean.includes('croissant') || clean.includes('مخبوزات') || clean.includes('حلويات')) {
    return BRAND_MEDIA.bakeryFood;
  }
  return BRAND_MEDIA.espressoV60;
}
