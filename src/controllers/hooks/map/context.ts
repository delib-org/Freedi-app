import { createContext } from 'react';
import { MapProps } from './types';

export const MapModelContext = createContext<MapProps | undefined>(undefined);
