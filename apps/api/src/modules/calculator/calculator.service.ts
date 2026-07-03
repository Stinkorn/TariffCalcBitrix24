import { Injectable } from '@nestjs/common';
import { CalculateDto, MarginType } from './dto/calculate.dto';

@Injectable()
export class CalculatorService {
  calculate(payload: CalculateDto) {
    // TODO: Replace temporary formula with approved tariff business logic from real tariff tables.
    const baseTransportCost = payload.weightKg * 2 + payload.volumeM3 * 50;
    const portHandlingCost = payload.services.portHandling ? 150 : 0;
    const storageCost = payload.services.storage ? 50 : 0;
    const reeferConnectionCost = payload.services.reeferConnection ? 75 : 0;
    const containerRentCost = payload.services.containerRent ? 100 : 0;

    const totalCost =
      baseTransportCost +
      portHandlingCost +
      storageCost +
      reeferConnectionCost +
      containerRentCost;

    const margin =
      payload.marginType === MarginType.PERCENT
        ? (totalCost * payload.marginValue) / 100
        : payload.marginValue;
    const clientPrice = totalCost + margin;

    const lines = [
      {
        stage: 'TEMP',
        name: 'Базовая перевозка',
        cost: baseTransportCost,
        currency: payload.currency
      }
    ];

    if (portHandlingCost > 0) {
      lines.push({
        stage: 'PORT_HANDLING',
        name: 'ПРР',
        cost: portHandlingCost,
        currency: payload.currency
      });
    }
    if (storageCost > 0) {
      lines.push({
        stage: 'STORAGE',
        name: 'Хранение',
        cost: storageCost,
        currency: payload.currency
      });
    }
    if (reeferConnectionCost > 0) {
      lines.push({
        stage: 'REEFER_CONNECTION',
        name: 'Реф-подключение',
        cost: reeferConnectionCost,
        currency: payload.currency
      });
    }
    if (containerRentCost > 0) {
      lines.push({
        stage: 'CONTAINER_RENT',
        name: 'Аренда контейнера',
        cost: containerRentCost,
        currency: payload.currency
      });
    }

    return {
      totalCost,
      margin,
      clientPrice,
      currency: payload.currency,
      lines,
      warnings: [
        'Используется временная формула расчета. Реальные тарифы будут подключены позже.'
      ]
    };
  }
}
