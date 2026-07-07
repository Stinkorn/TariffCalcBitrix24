import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Location } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BitrixPlacementService } from '../bitrix/bitrix-placement.service';
import { BitrixRestClient } from '../bitrix/bitrix-rest.client';

type LocationSeedItem = {
  city: string;
  region: string;
  country?: string;
  code: string;
  sortOrder?: number;
};

type BitrixListElement = {
  ID?: string | number;
  NAME?: string;
  name?: string;
  TITLE?: string;
  SORT?: string | number;
  ACTIVE?: string | boolean;
  TIMESTAMP_X?: string;
  PROPERTY_REGION?: string | string[];
  fields?: Record<string, unknown>;
  property?: Record<string, unknown>;
  PROPERTY?: Record<string, unknown>;
  PROPERTIES?: Record<string, unknown>;
  [key: string]: unknown;
};

type BitrixFieldCandidate = {
  key: string;
  value: string;
};

const DEFAULT_DICTIONARIES = {
  routeTypes: ['KLD_OUT', 'KLD_IN'],
  transportTypes: ['AUTO', 'RAIL', 'SEA', 'MULTIMODAL'],
  containerTypes: ['20DC', '40DC', '40HC', '20REF', '40REF'],
  containerStatuses: ['EMPTY', 'LOADED'],
  currencies: ['EUR', 'USD', 'RUB'],
  marginTypes: ['percent', 'fixed']
} as const;

const LOCATION_SEED_DATA: LocationSeedItem[] = [
  { city: 'Москва', region: 'Москва', code: 'MOSCOW', sortOrder: 10 },
  { city: 'Санкт-Петербург', region: 'Санкт-Петербург', code: 'SPB', sortOrder: 11 },
  { city: 'Калининград', region: 'Калининградская область', code: 'KALININGRAD', sortOrder: 20 },
  { city: 'Балтийск', region: 'Калининградская область', code: 'BALTIYSK', sortOrder: 21 },
  { city: 'Черняховск', region: 'Калининградская область', code: 'CHERNYAKHOVSK', sortOrder: 22 },
  { city: 'Советск', region: 'Калининградская область', code: 'SOVETSK_KGD', sortOrder: 23 },
  { city: 'Гусев', region: 'Калининградская область', code: 'GUSEV_KGD', sortOrder: 24 },
  { city: 'Краснодар', region: 'Краснодарский край', code: 'KRASNODAR', sortOrder: 30 },
  { city: 'Новороссийск', region: 'Краснодарский край', code: 'NOVOROSSIYSK', sortOrder: 31 },
  { city: 'Ростов-на-Дону', region: 'Ростовская область', code: 'ROSTOV_ON_DON', sortOrder: 32 },
  { city: 'Волгоград', region: 'Волгоградская область', code: 'VOLGOGRAD', sortOrder: 33 },
  { city: 'Воронеж', region: 'Воронежская область', code: 'VORONEZH', sortOrder: 34 },
  { city: 'Нижний Новгород', region: 'Нижегородская область', code: 'NIZHNY_NOVGOROD', sortOrder: 35 },
  { city: 'Казань', region: 'Республика Татарстан', code: 'KAZAN', sortOrder: 36 },
  { city: 'Самара', region: 'Самарская область', code: 'SAMARA', sortOrder: 37 },
  { city: 'Уфа', region: 'Республика Башкортостан', code: 'UFA', sortOrder: 38 },
  { city: 'Пермь', region: 'Пермский край', code: 'PERM', sortOrder: 39 },
  { city: 'Екатеринбург', region: 'Свердловская область', code: 'YEKATERINBURG', sortOrder: 40 },
  { city: 'Челябинск', region: 'Челябинская область', code: 'CHELYABINSK', sortOrder: 41 },
  { city: 'Тюмень', region: 'Тюменская область', code: 'TYUMEN', sortOrder: 42 },
  { city: 'Омск', region: 'Омская область', code: 'OMSK', sortOrder: 43 },
  { city: 'Новосибирск', region: 'Новосибирская область', code: 'NOVOSIBIRSK', sortOrder: 44 },
  { city: 'Красноярск', region: 'Красноярский край', code: 'KRASNOYARSK', sortOrder: 45 },
  { city: 'Иркутск', region: 'Иркутская область', code: 'IRKUTSK', sortOrder: 46 },
  { city: 'Хабаровск', region: 'Хабаровский край', code: 'KHABAROVSK', sortOrder: 47 },
  { city: 'Владивосток', region: 'Приморский край', code: 'VLADIVOSTOK', sortOrder: 48 },
  { city: 'Находка', region: 'Приморский край', code: 'NAKHODKA', sortOrder: 49 },
  { city: 'Уссурийск', region: 'Приморский край', code: 'USSURIYSK', sortOrder: 50 },
  {
    city: 'Петропавловск-Камчатский',
    region: 'Камчатский край',
    code: 'PETROPAVLOVSK_KAMCHATSKY',
    sortOrder: 51
  },
  { city: 'Южно-Сахалинск', region: 'Сахалинская область', code: 'YUZHNO_SAKHALINSK', sortOrder: 52 },
  { city: 'Мурманск', region: 'Мурманская область', code: 'MURMANSK', sortOrder: 53 },
  { city: 'Архангельск', region: 'Архангельская область', code: 'ARKHANGELSK', sortOrder: 54 },
  { city: 'Ярославль', region: 'Ярославская область', code: 'YAROSLAVL', sortOrder: 55 },
  { city: 'Тула', region: 'Тульская область', code: 'TULA', sortOrder: 56 },
  { city: 'Рязань', region: 'Рязанская область', code: 'RYAZAN', sortOrder: 57 },
  { city: 'Липецк', region: 'Липецкая область', code: 'LIPETSK', sortOrder: 58 },
  { city: 'Белгород', region: 'Белгородская область', code: 'BELGOROD', sortOrder: 59 },
  { city: 'Курск', region: 'Курская область', code: 'KURSK', sortOrder: 60 },
  { city: 'Саратов', region: 'Саратовская область', code: 'SARATOV', sortOrder: 61 },
  { city: 'Пенза', region: 'Пензенская область', code: 'PENZA', sortOrder: 62 },
  { city: 'Ижевск', region: 'Удмуртская Республика', code: 'IZHEVSK', sortOrder: 63 },
  { city: 'Набережные Челны', region: 'Республика Татарстан', code: 'NABEREZHNYE_CHELNY', sortOrder: 64 },
  { city: 'Киров', region: 'Кировская область', code: 'KIROV', sortOrder: 65 },
  { city: 'Вологда', region: 'Вологодская область', code: 'VOLOGDA', sortOrder: 66 },
  { city: 'Череповец', region: 'Вологодская область', code: 'CHEREPOVETS', sortOrder: 67 },
  { city: 'Псков', region: 'Псковская область', code: 'PSKOV', sortOrder: 68 },
  { city: 'Великий Новгород', region: 'Новгородская область', code: 'VELIKY_NOVGOROD', sortOrder: 69 },
  { city: 'Смоленск', region: 'Смоленская область', code: 'SMOLENSK', sortOrder: 70 },
  { city: 'Брянск', region: 'Брянская область', code: 'BRYANSK', sortOrder: 71 },
  { city: 'Орёл', region: 'Орловская область', code: 'ORYOL', sortOrder: 72 },
  { city: 'Тамбов', region: 'Тамбовская область', code: 'TAMBOV', sortOrder: 73 },
  { city: 'Ставрополь', region: 'Ставропольский край', code: 'STAVROPOL', sortOrder: 74 },
  { city: 'Пятигорск', region: 'Ставропольский край', code: 'PYATIGORSK', sortOrder: 75 },
  { city: 'Минеральные Воды', region: 'Ставропольский край', code: 'MINERALNYE_VODY', sortOrder: 76 },
  { city: 'Астрахань', region: 'Астраханская область', code: 'ASTRAKHAN', sortOrder: 77 },
  { city: 'Махачкала', region: 'Республика Дагестан', code: 'MAKHACHKALA', sortOrder: 78 },
  {
    city: 'Владикавказ',
    region: 'Республика Северная Осетия - Алания',
    code: 'VLADIKAVKAZ',
    sortOrder: 79
  },
  { city: 'Грозный', region: 'Чеченская Республика', code: 'GROZNY', sortOrder: 80 },
  { city: 'Сочи', region: 'Краснодарский край', code: 'SOCHI', sortOrder: 81 },
  { city: 'Севастополь', region: 'Севастополь', code: 'SEVASTOPOL', sortOrder: 82 },
  { city: 'Симферополь', region: 'Республика Крым', code: 'SIMFEROPOL', sortOrder: 83 }
];

@Injectable()
export class DictionariesService {
  private readonly logger = new Logger(DictionariesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bitrixPlacementService: BitrixPlacementService,
    private readonly bitrixRestClient: BitrixRestClient
  ) {}

  async getBootstrap() {
    const locations = await this.listLocations();
    return {
      ...DEFAULT_DICTIONARIES,
      locations
    };
  }

  async getLocations(search?: string) {
    const items = await this.listLocations(search);
    return { items };
  }

  async createLocation(input: { city?: string; region?: string }) {
    const city = input.city?.trim();
    const region = input.region?.trim();

    if (!city || !region) {
      throw new BadRequestException('city and region are required');
    }

    const existing = await this.prisma.location.findUnique({
      where: {
        city_region: {
          city,
          region
        }
      }
    });

    if (existing) {
      return this.toLocationDto(existing);
    }

    const code = await this.resolveLocationCode(city, region);
    const created = await this.prisma.location.create({
      data: {
        city,
        region,
        country: 'Россия',
        code,
        isActive: true,
        sortOrder: 100,
        source: 'manual'
      }
    });

    return this.toLocationDto(created);
  }

  async seedLocations() {
    let created = 0;
    let updated = 0;

    for (const item of LOCATION_SEED_DATA) {
      const existing = await this.prisma.location.findUnique({
        where: { code: item.code }
      });

      const data = {
        city: item.city.trim(),
        region: item.region.trim(),
        country: item.country?.trim() || 'Россия',
        sortOrder: item.sortOrder ?? 100,
        source: 'seed'
      };

      await this.prisma.location.upsert({
        where: { code: item.code },
        create: {
          ...data,
          code: item.code,
          isActive: true
        },
        update: data
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return {
      success: true,
      created,
      updated,
      skipped: 0,
      warnings: []
    };
  }

  async syncLocationsFromBitrix() {
    const listId = this.configService.get<string>('BITRIX_LOCATIONS_LIST_ID')?.trim();
    if (!listId) {
      throw new BadRequestException('BITRIX_LOCATIONS_LIST_ID is not configured');
    }

    const auth = await this.bitrixPlacementService.getPortalAuth();
    this.bitrixPlacementService.assertListsScope(auth.scope);

    const iblockTypeId =
      this.configService.get<string>('BITRIX_LOCATIONS_LIST_IBLOCK_TYPE_ID')?.trim() || 'lists';
    const cityField =
      this.configService.get<string>('BITRIX_LOCATIONS_CITY_FIELD')?.trim() || 'NAME';
    const regionField =
      this.configService.get<string>('BITRIX_LOCATIONS_REGION_FIELD')?.trim() || 'PROPERTY_REGION';
    const countryField =
      this.configService.get<string>('BITRIX_LOCATIONS_COUNTRY_FIELD')?.trim() || null;

    let response: unknown;
    try {
      response = await this.bitrixRestClient.callMethod(auth.domain, auth.accessToken, 'lists.element.get', {
        IBLOCK_TYPE_ID: iblockTypeId,
        IBLOCK_ID: listId,
        FILTER: {},
        SORT_BY: 'SORT',
        SORT_ORDER: 'ASC'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitrix list sync failed';
      if (/higher privileges than provided by the access token/i.test(message)) {
        throw new BadRequestException(
          'Добавьте право lists в локальном приложении Bitrix24 и переустановите приложение.'
        );
      }
      throw new BadGatewayException(`Не удалось получить список локаций из Bitrix24: ${message}`);
    }

    const elements = this.extractBitrixElements(response);
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const element of elements) {
      const bitrixElementId = this.readFirstString(element.ID);
      const rawCityValue = this.readBitrixFieldRawValue(element, cityField);
      const rawRegionValue = this.readBitrixFieldRawValue(element, regionField);
      const rawCountryValue = countryField ? this.readBitrixFieldRawValue(element, countryField) : null;
      const city = this.readBitrixField(element, cityField);
      const region = this.readBitrixField(element, regionField);
      const country = countryField ? this.readBitrixField(element, countryField) || 'Россия' : 'Россия';

      if (!bitrixElementId) {
        skipped += 1;
        warnings.push('Пропущен элемент списка Bitrix24 без ID.');
        continue;
      }

      if (!city || !region) {
        skipped += 1;
        warnings.push(
          `Пропущен элемент ${bitrixElementId}: пустой city или region. cityField=${cityField}, regionField=${regionField}, rawCity=${JSON.stringify(this.toSafeRawValue(rawCityValue))}, rawRegion=${JSON.stringify(this.toSafeRawValue(rawRegionValue))}`
        );
        continue;
      }

      const sortOrder = this.parseSortOrder(element.SORT);
      const isActive = this.parseBitrixActive(element.ACTIVE);
      const code = await this.resolveLocationCode(city, region);
      const bitrixUpdatedAt = this.parseBitrixDateTime(element.TIMESTAMP_X);

      const existingByBitrix = await this.prisma.location.findFirst({
        where: {
          bitrixListId: listId,
          bitrixElementId
        }
      });
      const existingByCityRegion = existingByBitrix
        ? null
        : await this.prisma.location.findUnique({
            where: {
              city_region: {
                city,
                region
              }
            }
          });

      const existing = existingByBitrix ?? existingByCityRegion;
      const data: Prisma.LocationUncheckedCreateInput = {
        city,
        region,
        country,
        code,
        isActive,
        sortOrder,
        source: 'bitrix',
        bitrixListId: listId,
        bitrixElementId,
        bitrixUpdatedAt
      };

      if (existing) {
        await this.prisma.location.update({
          where: { id: existing.id },
          data: {
            ...data,
            code: existing.code || code
          }
        });
        updated += 1;
      } else {
        await this.prisma.location.create({
          data
        });
        created += 1;
      }
    }

    return {
      success: true,
      created,
      updated,
      skipped,
      warnings
    };
  }

  async debugLocationsBitrixSync() {
    const listId = this.configService.get<string>('BITRIX_LOCATIONS_LIST_ID')?.trim();
    if (!listId) {
      throw new BadRequestException('BITRIX_LOCATIONS_LIST_ID is not configured');
    }

    const auth = await this.bitrixPlacementService.getPortalAuth();
    this.bitrixPlacementService.assertListsScope(auth.scope);

    const iblockTypeId =
      this.configService.get<string>('BITRIX_LOCATIONS_LIST_IBLOCK_TYPE_ID')?.trim() || 'lists';
    const cityField =
      this.configService.get<string>('BITRIX_LOCATIONS_CITY_FIELD')?.trim() || 'NAME';
    const regionField =
      this.configService.get<string>('BITRIX_LOCATIONS_REGION_FIELD')?.trim() || 'PROPERTY_REGION';
    const countryField =
      this.configService.get<string>('BITRIX_LOCATIONS_COUNTRY_FIELD')?.trim() || null;

    let response: unknown;
    try {
      response = await this.bitrixRestClient.callMethod(auth.domain, auth.accessToken, 'lists.element.get', {
        IBLOCK_TYPE_ID: iblockTypeId,
        IBLOCK_ID: listId,
        FILTER: {},
        SORT_BY: 'SORT',
        SORT_ORDER: 'ASC',
        NAV_PARAMS: { nPageSize: 5 },
        start: 0
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bitrix list debug failed';
      if (/higher privileges than provided by the access token/i.test(message)) {
        throw new BadRequestException(
          'Добавьте право lists в локальном приложении Bitrix24 и переустановите приложение.'
        );
      }
      throw new BadGatewayException(`Не удалось получить список локаций из Bitrix24: ${message}`);
    }

    const elements = this.extractBitrixElements(response).slice(0, 5);

    return {
      success: true,
      listId,
      iblockTypeId,
      configuredCityField: cityField,
      configuredRegionField: regionField,
      configuredCountryField: countryField,
      totalFetched: elements.length,
      items: elements.map((element) => this.toBitrixLocationDebugDto(element, cityField, regionField, countryField))
    };
  }

  private async listLocations(search?: string) {
    const trimmedSearch = search?.trim();
    const isSearch = Boolean(trimmedSearch);
    const limit = isSearch ? 50 : 200;
    const where: Prisma.LocationWhereInput = {
      isActive: true
    };

    if (trimmedSearch) {
      where.OR = [
        { city: { contains: trimmedSearch, mode: 'insensitive' } },
        { region: { contains: trimmedSearch, mode: 'insensitive' } }
      ];
    }

    const items = await this.prisma.location.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { city: 'asc' }],
      take: limit
    });

    return items.map((item) => this.toLocationDto(item));
  }

  private toLocationDto(item: Location) {
    return {
      id: item.id,
      code: item.code,
      city: item.city,
      region: item.region,
      country: item.country,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      source: item.source,
      bitrixElementId: item.bitrixElementId,
      label: `${item.city}, ${item.region}`
    };
  }

  private extractBitrixElements(response: unknown) {
    if (!response || typeof response !== 'object') {
      return [];
    }

    const record = response as { result?: unknown };
    const result = record.result;

    if (Array.isArray(result)) {
      return result as BitrixListElement[];
    }

    if (!result || typeof result !== 'object') {
      return [];
    }

    const values = Object.values(result as Record<string, unknown>);
    return values.filter((value) => value && typeof value === 'object') as BitrixListElement[];
  }

  private readBitrixField(element: BitrixListElement, fieldName: string) {
    return this.extractBitrixValue(this.readBitrixFieldRawValue(element, fieldName))?.trim() ?? '';
  }

  private readBitrixFieldRawValue(element: BitrixListElement, fieldName: string): unknown {
    if (fieldName === 'NAME') {
      return element.NAME;
    }

    return element[fieldName];
  }

  private toBitrixLocationDebugDto(
    element: BitrixListElement,
    cityField: string,
    regionField: string,
    countryField: string | null
  ) {
    const fields = this.readRecord(element.fields);
    const property = this.readRecord(element.property) ?? this.readRecord(element.PROPERTY) ?? this.readRecord(element.PROPERTIES);
    const cityCandidates = this.findBitrixFieldCandidates(element, ['NAME', 'name', 'TITLE', 'Город'], ['Город']);
    const regionCandidates = this.findBitrixFieldCandidates(element, ['Субъект РФ'], ['Субъект РФ']);
    const rawCityValue = this.readBitrixFieldRawValue(element, cityField);
    const rawRegionValue = this.readBitrixFieldRawValue(element, regionField);
    const rawCountryValue = countryField ? this.readBitrixFieldRawValue(element, countryField) : null;
    const selectedCountry = countryField ? this.readBitrixField(element, countryField) || 'Россия' : 'Россия';

    return {
      id: this.readFirstString(element.ID),
      topLevelKeys: this.safeKeys(element),
      fieldsKeys: fields ? this.safeKeys(fields) : [],
      propertyKeys: property ? this.safeKeys(property) : [],
      cityCandidates,
      regionCandidates,
      rawCityValueSafe: this.toSafeRawValue(rawCityValue),
      rawRegionValueSafe: this.toSafeRawValue(rawRegionValue),
      rawCountryValueSafe: this.toSafeRawValue(rawCountryValue),
      selectedCity: this.readBitrixField(element, cityField),
      selectedRegion: this.readBitrixField(element, regionField),
      selectedCountry
    };
  }

  private findBitrixFieldCandidates(
    element: BitrixListElement,
    directKeys: string[],
    labels: string[]
  ): BitrixFieldCandidate[] {
    const candidates: BitrixFieldCandidate[] = [];

    for (const key of directKeys) {
      const value = this.extractBitrixValue((element as Record<string, unknown>)[key]) ?? '';
      if (value) {
        candidates.push({ key, value });
      }
    }

    for (const nestedKey of ['fields', 'property', 'PROPERTY', 'PROPERTIES']) {
      const nested = this.readRecord((element as Record<string, unknown>)[nestedKey]);
      if (!nested) {
        continue;
      }

      for (const key of directKeys) {
        const value = this.extractBitrixValue(nested[key]) ?? '';
        if (value) {
          candidates.push({ key: `${nestedKey}.${key}`, value });
        }
      }
    }

    const records = this.collectBitrixPropertyRecords(element);
    for (const { key, value } of records) {
      const propertyCode = key.split('.').pop() ?? key;
      if (!propertyCode.startsWith('PROPERTY_')) {
        continue;
      }

      const propertyName = this.readBitrixPropertyName(value);
      const propertyValue = this.readBitrixPropertyValue(value);
      const keyMatchesLabel = labels.some((label) => propertyCode === label || propertyCode.includes(label));
      const nameMatchesLabel = labels.some((label) => propertyName === label);
      const valueMatchesLabel = labels.some((label) => propertyValue === label);

      if (keyMatchesLabel || nameMatchesLabel || valueMatchesLabel) {
        candidates.push({
          key: propertyName ? `${key} (${propertyName})` : key,
          value: propertyValue
        });
      }
    }

    return this.dedupeCandidates(candidates);
  }

  private collectBitrixPropertyRecords(element: BitrixListElement) {
    const records: Array<{ key: string; value: unknown }> = [];
    const topLevel = element as Record<string, unknown>;

    for (const [key, value] of Object.entries(topLevel)) {
      if (key.startsWith('PROPERTY_')) {
        records.push({ key, value });
      }
    }

    for (const nestedKey of ['fields', 'property', 'PROPERTY', 'PROPERTIES']) {
      const nested = this.readRecord(topLevel[nestedKey]);
      if (!nested) {
        continue;
      }

      for (const [key, value] of Object.entries(nested)) {
        if (key.startsWith('PROPERTY_')) {
          records.push({ key: `${nestedKey}.${key}`, value });
        }
      }
    }

    return records;
  }

  private readBitrixPropertyName(value: unknown): string {
    return this.extractBitrixValue(this.readRecord(value)?.NAME)
      || this.extractBitrixValue(this.readRecord(value)?.name)
      || this.extractBitrixValue(this.readRecord(value)?.TITLE)
      || '';
  }

  private readBitrixPropertyValue(value: unknown): string {
    return this.extractBitrixValue(value) ?? '';
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private dedupeCandidates(candidates: BitrixFieldCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.key}\n${candidate.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private safeKeys(record: Record<string, unknown>) {
    return Object.keys(record).filter((key) => !this.isSensitiveKey(key));
  }

  private isSensitiveKey(key: string) {
    return /access[_-]?token|refresh[_-]?token|client[_-]?secret|application[_-]?token|auth/i.test(key);
  }

  private extractBitrixValue(input: unknown): string | null {
    if (input === undefined || input === null) {
      return null;
    }

    if (typeof input === 'string') {
      const value = input.trim();
      return value || null;
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input).trim();
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        const value = this.extractBitrixValue(item);
        if (value) {
          return value;
        }
      }
      return null;
    }

    const record = this.readRecord(input);
    if (!record) {
      return null;
    }

    const directKeys = ['VALUE', 'value', 'TEXT', 'text', 'DISPLAY_VALUE', 'displayValue', 'NAME', 'name'];
    for (const key of directKeys) {
      if (key in record) {
        const value = this.extractBitrixValue(record[key]);
        if (value) {
          return value;
        }
      }
    }

    for (const value of Object.values(record)) {
      const extracted = this.extractBitrixValue(value);
      if (extracted) {
        return extracted;
      }
    }

    return null;
  }

  private toSafeRawValue(input: unknown): unknown {
    if (input === undefined || input === null) {
      return null;
    }

    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.toSafeRawValue(item));
    }

    const record = this.readRecord(input);
    if (!record) {
      return null;
    }

    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (this.isSensitiveKey(key)) {
        continue;
      }
      safe[key] = this.toSafeRawValue(value);
    }

    return safe;
  }

  private readFirstString(value: unknown): string {
    if (Array.isArray(value)) {
      for (const item of value) {
        const stringValue: string = this.readFirstString(item);
        if (stringValue) {
          return stringValue;
        }
      }
      return '';
    }

    if (value === undefined || value === null) {
      return '';
    }

    return String(value).trim();
  }

  private parseSortOrder(value: unknown) {
    const raw = Number(this.readFirstString(value));
    return Number.isFinite(raw) ? raw : 100;
  }

  private parseBitrixActive(value: unknown) {
    const normalized = this.readFirstString(value).toUpperCase();
    if (!normalized) {
      return true;
    }
    return normalized !== 'N' && normalized !== 'FALSE' && normalized !== '0';
  }

  private parseBitrixDateTime(value: unknown) {
    const raw = this.readFirstString(value);
    if (!raw) {
      return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async resolveLocationCode(city: string, region: string) {
    const base = this.toStableCode(city);
    const existing = await this.prisma.location.findFirst({
      where: { code: base }
    });

    if (!existing || (existing.city === city && existing.region === region)) {
      return base;
    }

    return `${base}_${this.toStableCode(region)}`;
  }

  private toStableCode(value: string) {
    const transliterationMap: Record<string, string> = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };

    const ascii = value
      .toLowerCase()
      .split('')
      .map((char) => transliterationMap[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

    return (ascii || 'LOCATION').toUpperCase();
  }
}
