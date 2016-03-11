import React from 'react/addons';
import Reflux from 'reflux';
import {Link} from 'react-router';
import {Navigation} from 'react-router';

import {dataInterface} from '../dataInterface';
import actions from '../actions';
import stores from '../stores';
import bem from '../bem';
import searches from '../searches';
import mixins from '../mixins';
import {
  t,
  assign,
} from '../utils';


var leaveBetaUrl = stores.pageState.leaveBetaUrl;

var CollectionSidebar = bem.create('collection-sidebar', '<ul>'),
    CollectionSidebar__item = bem.create('collection-sidebar__item', '<li>'),
    CollectionSidebar__itemlink = bem.create('collection-sidebar__itemlink', '<a>');

class DrawerTitle extends React.Component {
  render () {
    var kls = 'sidebar-title';
    if (this.props.separator) {
      kls += ' separator';
    }
    return (
        <li className={kls}>
          <span>{this.props.label}</span>
        </li>
      );
  }
}
class DrawerLink extends React.Component {
  onClick (evt) {
    if (!this.props.href) {
      evt.preventDefault();
    }
    if (this.props.onClick) {
      this.props.onClick(evt);
    }
  }

  render () {
    var icon_class = `ki ki-${this.props['ki-icon'] || 'globe'}`; 
    var icon = (<span className={icon_class}></span>);

    var link;
    if (this.props.linkto) {
      link = (
            <Link to={this.props.linkto}
                className='k-drawer__link'
                activeClassName='active'
                title={this.props.label}>
              {icon} 
              <span className="label">{this.props.label}</span>
            </Link>
            );
    } else {
      link = (
          <a href={this.props.href || '#'}
              className='k-drawer__link'
              onClick={this.onClick.bind(this)} title={this.props.label}>{icon} <span className="label">{this.props.label}</span></a>
        );
    }
    return link;
  }
}
var Drawer = React.createClass({
  mixins: [
    searches.common,
    mixins.droppable,
    Navigation,
    Reflux.ListenerMixin,
    Reflux.connect(stores.session),
    Reflux.connect(stores.pageState),
  ],
  queryCollections () {
    dataInterface.listCollections().then((collections)=>{
      this.setState({
        sidebarCollections: collections.results,
      });
    });
  },
  componentDidMount () {
    this.searchDefault();
    this.queryCollections();
  },
  getInitialState () {
    return assign({
      showRecent: true,
    }, stores.pageState.state, 
    {
      searchContext: searches.getSearchContext('library', {
        filterParams: {
          assetType: 'asset_type:question OR asset_type:block',
        },
        filterTags: 'asset_type:question OR asset_type:block',
      })
    }
    );
  },
  clickFilterByCollection (evt) {
    var data = $(evt.currentTarget).data();
    if (data.collectionUid) {
      this.filterByCollection(data.collectionUid);
    } else {
      this.filterByCollection(false);
    }
  },
  filterByCollection (collectionUid) {
    if (collectionUid) {
      this.quietUpdateStore({
        parentUid: collectionUid,
      });
    } else {
      this.quietUpdateStore({
        parentUid: false,
      });
    }
    this.searchValue();
    this.setState({
      filteredCollectionUid: collectionUid,
    });
  },
  createCollection () {
    customPromptAsync('collection name?').then((val)=>{
      dataInterface.createCollection({
        name: val,
      }).then((data)=>{
        this.queryCollections();
      });
    });
  },
  deleteCollection (evt) {
    evt.preventDefault();
    var collectionUid = $(evt.currentTarget).data('collection-uid');
    customConfirmAsync('are you sure you want to delete this collection? this action is not reversible').then(()=>{
      var qc = () => this.queryCollections();
      dataInterface.deleteCollection({uid: collectionUid}).then(qc).catch(qc);
    });
  }, 
  render () {
    return (
          <bem.Drawer className='mdl-layout__drawer mdl-shadow--2dp'>
            <nav className='k-drawer__icons'> 
              <DrawerLink label={t('forms')} linkto='forms' ki-icon='forms' />
              <DrawerLink label={t('library')} linkto='library' ki-icon='library' />
              { stores.session.currentAccount ?
                  <DrawerLink label={t('projects')} active='true' href={stores.session.currentAccount.projects_url} ki-icon='globe' />
              : null }

              <div className="mdl-layout-spacer"></div>

              <div className='k-drawer__icons-bottom'>
                <DrawerLink label={t('source')} href='https://github.com/kobotoolbox/' ki-icon='github' />
                <DrawerLink label={t('help')} href='http://support.kobotoolbox.org/' ki-icon='help' />
              </div>
            </nav>

            <div className="drawer__sidebar">
              { this.state.sidebarCollections ?
                <CollectionSidebar>
                  <CollectionSidebar__item
                    key='allitems'
                    m={{
                        allitems: true,
                        selected: !this.state.filteredCollectionUid,
                      }} onClick={this.clickFilterByCollection}>
                    <i />
                    {t('all items (no filter)')}
                  </CollectionSidebar__item>
                  {/*
                  <CollectionSidebar__item
                    key='info'
                    m='info'
                  >
                    {t('filter by collection')}
                  </CollectionSidebar__item>
                  */}
                  {this.state.sidebarCollections.map((collection)=>{  
                    var editLink = this.makeHref('collection-page', {uid: collection.uid}),
                      sharingLink = this.makeHref('collection-sharing', {assetid: collection.uid});
                    return (
                        <CollectionSidebar__item
                          key={collection.uid}
                          m={{
                            collection: true,
                            selected: this.state.filteredCollectionUid === collection.uid,
                          }}
                          onClick={this.clickFilterByCollection}
                          data-collection-uid={collection.uid}
                        >
                          <i />
                          {collection.name}
                          <CollectionSidebar__itemlink href={'#'}
                            onClick={this.deleteCollection}
                            data-collection-uid={collection.uid}>
                            {t('delete')}
                          </CollectionSidebar__itemlink>
                          <CollectionSidebar__itemlink href={sharingLink}>
                            {t('sharing')}
                          </CollectionSidebar__itemlink>
                          <CollectionSidebar__itemlink href={editLink}>
                            {t('edit')}
                          </CollectionSidebar__itemlink>
                        </CollectionSidebar__item>
                      );
                  })}
                </CollectionSidebar>
                :
                <CollectionSidebar>
                  <CollectionSidebar__item m={'loading'}>
                    {t('loading')}
                    <i />
                  </CollectionSidebar__item>
                </CollectionSidebar>
              }
            </div>
          </bem.Drawer>
      );
  }
});

export default Drawer;
