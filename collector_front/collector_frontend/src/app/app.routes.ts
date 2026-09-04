import { Routes } from '@angular/router';
import { VideoVaultPage } from '../components/video-vault-page/video-vault-page';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'video-vault' },
	{ path: 'video-vault', component: VideoVaultPage },
	{ path: '**', redirectTo: 'video-vault' }
];
