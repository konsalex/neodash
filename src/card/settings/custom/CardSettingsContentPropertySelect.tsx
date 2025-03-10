// TODO: this file (in a way) belongs to chart/parameter/ParameterSelectionChart. It would make sense to move it there

import React, { useCallback, useContext, useEffect } from 'react';
import { RUN_QUERY_DELAY_MS } from '../../../config/ReportConfig';
import { QueryStatus, runCypherQuery } from '../../../report/ReportQueryRunner';
import { Neo4jContext, Neo4jContextState } from 'use-neo4j/dist/neo4j.context';
import { debounce, MenuItem, TextField } from '@material-ui/core';
import { Autocomplete } from '@material-ui/lab';
import NeoField from '../../../component/field/Field';
import { getReportTypes } from '../../../extensions/ExtensionUtils';

const NeoCardSettingsContentPropertySelect = ({
  type,
  database,
  settings,
  extensions,
  onReportSettingUpdate,
  onQueryUpdate,
}) => {
  const { driver } = useContext<Neo4jContextState>(Neo4jContext);
  if (!driver) {
    throw new Error(
      '`driver` not defined. Have you added it into your app as <Neo4jContext.Provider value={{driver}}> ?'
    );
  }

  const debouncedRunCypherQuery = useCallback(debounce(runCypherQuery, RUN_QUERY_DELAY_MS), []);

  const { manualPropertyNameSpecification } = settings;
  const [labelInputText, setLabelInputText] = React.useState(settings.entityType);
  const [labelRecords, setLabelRecords] = React.useState([]);
  const [propertyInputText, setPropertyInputText] = React.useState(settings.propertyType);
  const [propertyInputDisplayText, setPropertyInputDisplayText] = React.useState(
    settings.propertyTypeDisplay || settings.propertyType
  );
  const [propertyRecords, setPropertyRecords] = React.useState([]);
  let { parameterName } = settings;

  // When certain settings are updated, a re-generated search query is needed.
  useEffect(() => {
    updateReportQuery(
      settings.entityType,
      settings.propertyType,
      settings.propertyTypeDisplay || settings.propertyTypeDisplay
    );
  }, [settings.suggestionLimit, settings.deduplicateSuggestions, settings.searchType, settings.caseSensitive]);

  const cleanParameter = (parameter: string) => parameter.replaceAll(' ', '_').replaceAll('-', '_').toLowerCase();
  const formatParameterId = (id: string | undefined | null) => {
    const cleanedId = id || '';
    const formattedId = cleanedId == '' || cleanedId.startsWith('_') ? cleanedId : `_${cleanedId}`;
    return formattedId;
  };

  if (settings.type == undefined) {
    onReportSettingUpdate('type', 'Node Property');
  }

  if (!parameterName && settings.entityType && settings.propertyType) {
    const entityAndPropertyType = `neodash_${settings.entityType}_${settings.propertyType}`;
    const formattedParameterId = formatParameterId(settings.id);
    const parameterName = cleanParameter(entityAndPropertyType + formattedParameterId);

    onReportSettingUpdate('parameterName', parameterName);
  }
  // Define query callback to allow reports to get extra data on interactions.
  const queryCallback = useCallback((query, parameters, setRecords) => {
    debouncedRunCypherQuery(
      driver,
      database,
      query,
      parameters,
      10,
      (status) => {
        status == QueryStatus.NO_DATA ? setRecords([]) : null;
      },
      (result) => setRecords(result),
      () => {}
    );
  }, []);

  function handleParameterTypeUpdate(newValue) {
    onReportSettingUpdate('entityType', undefined);
    onReportSettingUpdate('propertyType', undefined);
    onReportSettingUpdate('propertyTypeDisplay', undefined);
    onReportSettingUpdate('id', undefined);
    onReportSettingUpdate('parameterName', undefined);
    onReportSettingUpdate('type', newValue);
  }

  function handleNodeLabelSelectionUpdate(newValue) {
    setPropertyInputText('');
    setPropertyInputDisplayText('');
    onReportSettingUpdate('entityType', newValue);
    onReportSettingUpdate('propertyType', undefined);
    onReportSettingUpdate('propertyTypeDisplay', undefined);
    onReportSettingUpdate('parameterName', undefined);
  }

  function handleFreeTextNameSelectionUpdate(newValue) {
    if (newValue) {
      const new_parameter_name = cleanParameter(`neodash_${newValue}`);
      handleReportQueryUpdate(new_parameter_name, newValue, undefined, undefined);
    } else {
      onReportSettingUpdate('parameterName', undefined);
    }
  }

  function handlePropertyNameSelectionUpdate(newValue) {
    onReportSettingUpdate('propertyType', newValue);
    onReportSettingUpdate('propertyTypeDisplay', newValue);
    if (newValue && settings.entityType) {
      const newParameterName = `neodash_${settings.entityType}_${newValue}`;
      const formattedParameterId = formatParameterId(settings.id);
      const cleanedParameter = cleanParameter(newParameterName + formattedParameterId);

      handleReportQueryUpdate(cleanedParameter, settings.entityType, newValue, newValue);
    } else {
      onReportSettingUpdate('parameterName', undefined);
    }
  }

  function handlePropertyDisplayNameSelectionUpdate(newValue) {
    onReportSettingUpdate('propertyTypeDisplay', newValue);
    if (newValue && settings.entityType) {
      updateReportQuery(settings.entityType, settings.propertyType, newValue);
    } else {
      onReportSettingUpdate('parameterName', undefined);
    }
  }

  function handleIdSelectionUpdate(value) {
    const newValue = value ? value : '';
    onReportSettingUpdate('id', `${newValue}`);
    if (settings.propertyType && settings.entityType) {
      const newParameterName = `neodash_${settings.entityType}_${settings.propertyType}`;
      const formattedParameterId = formatParameterId(`${newValue}`);
      const cleanedParameter = cleanParameter(newParameterName + formattedParameterId);

      handleReportQueryUpdate(
        cleanedParameter,
        settings.entityType,
        settings.propertyType,
        settings.propertyTypeDisplay
      );
    }
  }

  function handleReportQueryUpdate(new_parameter_name, entityType, propertyType, propertyTypeDisplay) {
    onReportSettingUpdate('parameterName', new_parameter_name);
    updateReportQuery(entityType, propertyType, propertyTypeDisplay);
  }

  function updateReportQuery(entityType, propertyType, propertyTypeDisplay) {
    const propertyTypeDisplaySanitized = propertyTypeDisplay || propertyType;
    const limit = settings.suggestionLimit ? settings.suggestionLimit : 5;
    const deduplicate = settings.deduplicateSuggestions !== undefined ? settings.deduplicateSuggestions : true;
    const searchType = settings.searchType ? settings.searchType : 'CONTAINS';
    const caseSensitive = settings.caseSensitive !== undefined ? settings.caseSensitive : false;
    if (settings.type == 'Node Property') {
      const newQuery =
        `MATCH (n:\`${entityType}\`) \n` +
        `WHERE ${caseSensitive ? '' : 'toLower'}(toString(n.\`${propertyTypeDisplaySanitized}\`)) ${searchType} ${
          caseSensitive ? '' : 'toLower'
        }($input) \n` +
        `RETURN ${deduplicate ? 'DISTINCT' : ''} n.\`${propertyType}\` as value, ` +
        ` n.\`${propertyTypeDisplaySanitized}\` as display ` +
        `ORDER BY size(toString(value)) ASC LIMIT ${limit}`;
      onQueryUpdate(newQuery);
    } else if (settings.type == 'Relationship Property') {
      const newQuery =
        `MATCH ()-[n:\`${entityType}\`]->() \n` +
        `WHERE ${caseSensitive ? '' : 'toLower'}(toString(n.\`${propertyTypeDisplaySanitized}\`)) ${searchType} ${
          caseSensitive ? '' : 'toLower'
        }($input) \n` +
        `RETURN ${deduplicate ? 'DISTINCT' : ''} n.\`${propertyType}\` as value, ` +
        ` n.\`${propertyTypeDisplaySanitized}\` as display ` +
        `ORDER BY size(toString(value)) ASC LIMIT ${limit}`;
      onQueryUpdate(newQuery);
    } else {
      const newQuery = 'RETURN true';
      onQueryUpdate(newQuery);
    }
  }

  // TODO: since this component is only rendered for parameter select, this is technically not needed
  const parameterSelectTypes = ['Node Property', 'Relationship Property', 'Free Text'];
  const reportTypes = getReportTypes(extensions);
  const overridePropertyDisplayName =
    settings.overridePropertyDisplayName !== undefined ? settings.overridePropertyDisplayName : false;

  // If the override is off, and the two values differ, set the display value to the original one again.
  if (overridePropertyDisplayName == false && propertyInputText !== propertyInputDisplayText) {
    onReportSettingUpdate('propertyTypeDisplay', settings.propertyType);
    setPropertyInputDisplayText(propertyInputText);
    updateReportQuery(settings.entityType, settings.propertyType, settings.propertyType);
  }

  return (
    <div>
      <p style={{ color: 'grey', fontSize: 12, paddingLeft: '5px', border: '1px solid lightgrey', marginTop: '0px' }}>
        {reportTypes[type].helperText}
      </p>
      <TextField
        select={true}
        autoFocus
        id='type'
        value={settings.type ? settings.type : 'Node Property'}
        onChange={(e) => {
          handleParameterTypeUpdate(e.target.value);
        }}
        label='Selection Type'
        type='text'
        style={{ width: 350, marginLeft: '5px', marginTop: '0px' }}
      >
        {parameterSelectTypes.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>

      {settings.type == 'Free Text' ? (
        <NeoField
          label={'Name'}
          key={'freetext'}
          value={settings.entityType ? settings.entityType : ''}
          defaultValue={''}
          placeholder={'Enter a parameter name here...'}
          style={{ width: 335, marginLeft: '5px', marginTop: '0px' }}
          onChange={(value) => {
            setLabelInputText(value);
            handleNodeLabelSelectionUpdate(value);
            handleFreeTextNameSelectionUpdate(value);
          }}
        />
      ) : (
        <>
          <Autocomplete
            id='autocomplete-label-type'
            options={
              manualPropertyNameSpecification
                ? [settings.entityType]
                : labelRecords.map((r) => (r._fields ? r._fields[0] : '(no data)'))
            }
            getOptionLabel={(option) => option || ''}
            style={{ width: 350, marginLeft: '5px', marginTop: '5px' }}
            inputValue={labelInputText}
            onInputChange={(event, value) => {
              setLabelInputText(value);
              if (manualPropertyNameSpecification) {
                handleNodeLabelSelectionUpdate(value);
              } else if (settings.type == 'Node Property') {
                queryCallback(
                  'CALL db.labels() YIELD label WITH label as nodeLabel WHERE toLower(nodeLabel) CONTAINS toLower($input) RETURN DISTINCT nodeLabel LIMIT 5',
                  { input: value },
                  setLabelRecords
                );
              } else {
                queryCallback(
                  'CALL db.relationshipTypes() YIELD relationshipType WITH relationshipType as relType WHERE toLower(relType) CONTAINS toLower($input) RETURN DISTINCT relType LIMIT 5',
                  { input: value },
                  setLabelRecords
                );
              }
            }}
            value={settings.entityType ? settings.entityType : undefined}
            onChange={(event, newValue) => handleNodeLabelSelectionUpdate(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder='Start typing...'
                InputLabelProps={{ shrink: true }}
                label={settings.type == 'Node Property' ? 'Node Label' : 'Relationship Type'}
              />
            )}
          />
          {/* Draw the property name & id selectors only after a label/type has been selected. */}
          {settings.entityType ? (
            <>
              <Autocomplete
                id='autocomplete-property'
                options={
                  manualPropertyNameSpecification
                    ? [settings.propertyType]
                    : propertyRecords.map((r) => (r._fields ? r._fields[0] : '(no data)'))
                }
                getOptionLabel={(option) => (option ? option : '')}
                style={{ display: 'inline-block', width: 170, marginLeft: '5px', marginTop: '5px' }}
                inputValue={propertyInputText}
                onInputChange={(event, value) => {
                  setPropertyInputText(value);
                  setPropertyInputDisplayText(value);
                  if (manualPropertyNameSpecification) {
                    handlePropertyNameSelectionUpdate(value);
                  } else {
                    queryCallback(
                      'CALL db.propertyKeys() YIELD propertyKey as propertyName WITH propertyName WHERE toLower(propertyName) CONTAINS toLower($input) RETURN DISTINCT propertyName LIMIT 5',
                      { input: value },
                      setPropertyRecords
                    );
                  }
                }}
                value={settings.propertyType}
                onChange={(event, newValue) => handlePropertyNameSelectionUpdate(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder='Start typing...'
                    InputLabelProps={{ shrink: true }}
                    label={'Property Name'}
                  />
                )}
              />
              {overridePropertyDisplayName ? (
                <Autocomplete
                  id='autocomplete-property-display'
                  options={
                    manualPropertyNameSpecification
                      ? [settings.propertyTypeDisplay || settings.propertyType]
                      : propertyRecords.map((r) => (r._fields ? r._fields[0] : '(no data)'))
                  }
                  getOptionLabel={(option) => (option ? option : '')}
                  style={{ display: 'inline-block', width: 170, marginLeft: '10px', marginTop: '5px' }}
                  inputValue={propertyInputDisplayText}
                  onInputChange={(event, value) => {
                    setPropertyInputDisplayText(value);
                    if (manualPropertyNameSpecification) {
                      handlePropertyDisplayNameSelectionUpdate(value);
                    } else {
                      queryCallback(
                        'CALL db.propertyKeys() YIELD propertyKey as propertyName WITH propertyName WHERE toLower(propertyName) CONTAINS toLower($input) RETURN DISTINCT propertyName LIMIT 5',
                        { input: value },
                        setPropertyRecords
                      );
                    }
                  }}
                  value={settings.propertyTypeDisplay || settings.propertyType}
                  onChange={(event, newValue) => handlePropertyDisplayNameSelectionUpdate(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder='Start typing...'
                      InputLabelProps={{ shrink: true }}
                      label={'Property Display Name'}
                    />
                  )}
                />
              ) : (
                <></>
              )}
              <NeoField
                placeholder='number'
                label='Number (optional)'
                disabled={!settings.propertyType}
                value={settings.id}
                style={{ width: '170px', marginTop: '5px', marginLeft: '5px' }}
                onChange={(value) => {
                  handleIdSelectionUpdate(value);
                }}
              />
            </>
          ) : (
            <></>
          )}
        </>
      )}
      {parameterName ? (
        <p>
          Use <b>${parameterName}</b> in a query to use the parameter.
        </p>
      ) : (
        <></>
      )}
    </div>
  );
};

export default NeoCardSettingsContentPropertySelect;
