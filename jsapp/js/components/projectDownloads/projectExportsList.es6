import React from 'react';
import autoBind from 'react-autobind';
import alertify from 'alertifyjs';
import bem from 'js/bem';
import {actions} from 'js/actions';
import {formatTime} from 'js/utils';
import {getLanguageIndex} from 'js/assetUtils';
import LoadingSpinner from 'js/components/common/loadingSpinner';
import {PERMISSIONS_CODENAMES} from 'js/components/permissions/permConstants';
import {
  EXPORT_TYPES,
  EXPORT_FORMATS,
  EXPORT_STATUSES,
} from 'js/components/projectDownloads/exportsConstants';
import exportsStore from 'js/components/projectDownloads/exportsStore';
import ExportFetcher from 'js/components/projectDownloads/exportFetcher';
import {userCan} from 'js/components/permissions/utils';
import Button from 'js/components/common/button';
import SimpleTable from 'js/components/common/SimpleTable';
import {Text, Flex} from '@mantine/core';

/**
 * Component that displays all available downloads (for logged in user only).
 *
 * @prop {object} asset
 */
export default class ProjectExportsList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isComponentReady: false,
      rows: [],
      selectedExportType: exportsStore.getExportType(),
    };

    this.unlisteners = [];
    this.exportFetchers = new Map();

    autoBind(this);
  }

  componentDidMount() {
    this.unlisteners.push(
      exportsStore.listen(this.onExportsStoreChange),
      actions.exports.getExports.completed.listen(this.onGetExports),
      actions.exports.createExport.completed.listen(this.onCreateExport),
      actions.exports.deleteExport.completed.listen(this.onDeleteExport),
      actions.exports.getExport.completed.listen(this.onGetExport),
    );
    this.fetchExports();
  }

  componentWillUnmount() {
    this.unlisteners.forEach((clb) => {clb();});
    this.stopAllExportFetchers();
  }

  onExportsStoreChange() {
    this.setState({selectedExportType: exportsStore.getExportType()});
  }

  onGetExports(response) {
    response.results.forEach((exportData) => {
      this.checkExportFetcher(exportData.uid, exportData.status);
    });

    this.setState({
      isComponentReady: true,
      rows: response.results,
    });
  }

  onCreateExport(response) {
    this.fetchExport(response.uid);
  }

  onDeleteExport() {
    this.fetchExports();
  }

  onGetExport(exportData) {
    this.checkExportFetcher(exportData.uid, exportData.status);

    // Replace existing export with fresh data or add new on top
    const newStateObj = {rows: this.state.rows};
    let wasAdded = false;
    newStateObj.rows.forEach((rowData, index) => {
      if (rowData.uid === exportData.uid) {
        newStateObj.rows[index] = exportData;
        wasAdded = true;
      }
    });
    if (!wasAdded) {
      newStateObj.rows.unshift(exportData);
    }
    this.setState(newStateObj);
  }

  /**
   * This method initializes an interval for fetching export based on
   * the provided status.
   */
  checkExportFetcher(exportUid, exportStatus) {
    if (
      exportStatus !== EXPORT_STATUSES.error &&
      exportStatus !== EXPORT_STATUSES.complete &&
      !this.exportFetchers.has(exportUid)
    ) {
      this.addExportFetcher(exportUid);
    }

    // clean up after it is completed
    if (
      exportStatus === EXPORT_STATUSES.error ||
      exportStatus === EXPORT_STATUSES.complete
    ) {
      this.stopExportFetcher(exportUid);
    }
  }

  addExportFetcher(exportUid) {
    // Creating new ExportFetcher instance will immediately start an interval.
    this.exportFetchers.set(
      exportUid,
      new ExportFetcher(this.props.asset.uid, exportUid)
    );
  }

  stopExportFetcher(exportUid) {
    const exportFetcher = this.exportFetchers.get(exportUid);
    if (exportFetcher) {
      exportFetcher.stop();
    }
    this.exportFetchers.delete(exportUid);
  }

  stopAllExportFetchers() {
    for (const exportUid of this.exportFetchers.keys()) {
      this.stopExportFetcher(exportUid);
    }
  }

  fetchExport(exportUid) {
    actions.exports.getExport(this.props.asset.uid, exportUid);
  }

  fetchExports() {
    actions.exports.getExports(this.props.asset.uid);
  }

  deleteExport(exportUid) {
    const dialog = alertify.dialog('confirm');
    const opts = {
      title: t('Delete export?'),
      message: t('Are you sure you want to delete this export? This action is not reversible.'),
      labels: {ok: t('Delete'), cancel: t('Cancel')},
      onok: () => {actions.exports.deleteExport(this.props.asset.uid, exportUid);},
      oncancel: () => {dialog.destroy();},
    };
    dialog.set(opts).show();
  }

  /**
   * For `true` it is "Yes", any other (e.g. `false` or missing) is "No"
   */
  renderBooleanAnswer(isTrue) {
    if (isTrue) {
      return t('Yes');
    } else {
      return t('No');
    }
  }

  /**
   * Unchecked wisdom copied from old version of this component:
   * > Some old SPSS exports may have a meaningless `lang` attribute -- disregard it
   */
  renderLanguage(exportLang) {
    // Unknown happens when export was done for a translated language that
    // doesn't exist in current form version
    let languageDisplay = (<em>{t('Unknown')}</em>);
    const langIndex = getLanguageIndex(this.props.asset, exportLang);
    if (langIndex !== -1) {
      languageDisplay = exportLang;
    } else if (EXPORT_FORMATS[exportLang]) {
      languageDisplay = EXPORT_FORMATS[exportLang].label;
    }
    return languageDisplay;
  }

  getRows() {
    return this.state.rows.map((exportData) => (
      [
        EXPORT_TYPES[exportData.data.type]?.label,
        formatTime(exportData.date_created),
        this.renderLanguage(exportData.data.lang),
        <Text key='include-groups' ta='center'>
          {this.renderBooleanAnswer(exportData.data.hierarchy_in_labels)}
        </Text>,
        <Text key='multiple-versions' ta='center'>
          {this.renderBooleanAnswer(exportData.data.fields_from_all_versions)}
        </Text>,
        <Flex
          gap='xs'
          justify='flex-end'
          align='center'
          direction='row'
          wrap='nowrap'
          key='buttons'
        >
          {exportData.status === EXPORT_STATUSES.complete &&
            <Button
              type='secondary'
              size='m'
              startIcon='download'
              label={t('Download')}
              onClick={() => {
                window.open(exportData.result, '_blank');
              }}
            />
          }

          {exportData.status === EXPORT_STATUSES.error &&
            <span className='right-tooltip' data-tip={exportData.messages?.error}>
              {t('Export Failed')}
            </span>
          }

          {(
            exportData.status !== EXPORT_STATUSES.complete &&
            exportData.status !== EXPORT_STATUSES.error
          ) &&
            <span className='animate-processing'>{t('Processing…')}</span>
          }

          {userCan(PERMISSIONS_CODENAMES.view_submissions, this.props.asset) &&
            <Button
              type='secondary-danger'
              size='m'
              startIcon='trash'
              onClick={this.deleteExport.bind(this, exportData.uid)}
            />
          }
        </Flex>
      ]
    ));
  }

  render() {
    if (!this.state.isComponentReady) {
      return (
        <bem.FormView__row>
          <bem.FormView__cell>
            <LoadingSpinner/>
          </bem.FormView__cell>
        </bem.FormView__row>
      );
    // don't display the component if no exports
    // or if selected a legacy type
    } else if (
      this.state.rows.length === 0 ||
      this.state.selectedExportType.isLegacy
    ) {
      return null;
    } else {
      return (
        <React.Fragment>
          <bem.FormView__cell m={['page-subtitle']}>
            {t('Exports')}
          </bem.FormView__cell>

          <SimpleTable
            head={[
              t('Type'),
              t('Created'),
              t('Language'),
              <Text key='include-groups' ta='center'>{t('Include Groups')}</Text>,
              <Text key='multiple-versions' ta='center'>{t('Multiple Versions')}</Text>,
              '',
            ]}
            body={this.getRows()}
            minWidth={600}
          />
        </React.Fragment>
      );
    }
  }
}
