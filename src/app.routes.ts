import { Routes } from '@angular/router';
import { VideoPlayerComponent } from './components/video-player/video-player.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { ChannelsComponent } from './components/channels/channels.component';
import { ChannelDetailComponent } from './components/channel-detail/channel-detail.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { WatchlistComponent } from './components/watchlist/watchlist.component';
import { HomeComponent } from './components/home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'YoruTube' },
  { path: 'watch/:mediaType/:id', component: VideoPlayerComponent, title: 'Watch' },
  { path: 'watch/:mediaType/:id/season/:season/episode/:episode', component: VideoPlayerComponent, title: 'Watch' },
  { path: 'search', component: SearchResultsComponent, title: 'Search' },
  { path: 'discover', component: DiscoverComponent, title: 'Discover' },
  { path: 'channels', component: ChannelsComponent, title: 'Channels' },
  { path: 'channel/:id', component: ChannelDetailComponent, title: 'Channel' },
  { path: 'watchlist', component: WatchlistComponent, title: 'Watchlist' },
  { path: '**', redirectTo: '' }
];
